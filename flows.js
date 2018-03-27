// canvas on which all the flowing lines will be drawn, and some convenience variables
var flowCanvas = document.createElement('canvas');
flowCanvas.id='flow';
var flowContext;
var flowImageData;
var flowData;

// invisible canvas to which Mapzen elevation tiles will be drawn so we can calculate stuff
var demCanvas = document.createElement('canvas');
var demContext;
var demImageData;
var demData;

var wait;

// not too big or this can get hella slow
var width = window.innerWidth;
var height = window.innerHeight;
document.getElementById('map').style.width = width + 'px';
document.getElementById('map').style.height = height + 'px';

flowCanvas.width = width;
flowCanvas.height = height;
demCanvas.width = width;
demCanvas.height = height;

flowContext = flowCanvas.getContext('2d');
demContext = demCanvas.getContext('2d');



var data = [];

var exampleLocations = [
  {name: 'Mount Fuji', coords: [35.3577, 138.7331, 13]},
  {name: 'Big Island, Hawaii', coords: [19.6801, -155.5132, 9]},
  {name: 'Grand Canyon', coords: [36.0469, -113.8416, 13]},
  //{name: 'Mount Everest', coords: [27.9885, 86.9233, 12]},
  {name: 'Mount Rainier', coords:[46.8358, -121.7663, 11]},
  {name: 'White Mountains', coords:[44.0859, -71.4441, 11]}
];

var map_start_location = exampleLocations[Math.floor(Math.random()*exampleLocations.length)].coords;
var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

if (url_hash.length == 3) {
    map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
    map_start_location = map_start_location.map(Number);
}

var map = L.map('map',{scrollWheelZoom: false, zoomControl: false});
var hash = new L.Hash(map);
map.setView(map_start_location.slice(0, 3), map_start_location[2]);

// var LayerToggle = L.Control.extend({
//   onAdd: function (map) {
//     var el = document.createElement('div');
//     el.className = 'button';
//     el.id = 'toggle-terrain';
//     el.innerHTML = 'toggle background';
//     el.onclick = function () {
//       // if (hillshade._container.style.display != 'none') hillshade._container.style.display = 'none';
//       // else hillshade._container.style.display = 'block';
//       // if (lakes._container.style.display != 'none') lakes._container.style.display = 'none';
//       // else lakes._container.style.display = 'block';
//       if (bgLayer.options.opacity !== 0) bgLayer.setOpacity(0);
//       else bgLayer.setOpacity(1);
//     }
//     return el;
//   }
// })

// new LayerToggle({position: 'bottomright'}).addTo(map);
L.control.zoom({position:'bottomright'}).addTo(map);

// var hillshade = Tangram.leafletLayer({
//     scene: 'styles/elevation-tiles.yaml',
//     attribution: '<a href="https://mapzen.com/" target="_blank">Mapzen</a>'
// }).addTo(map);



map.on('moveend', function() {
  // on move end we redraw the flow layer, so clear some stuff
 
  flowContext.clearRect(0,0,width,height);
  clearTimeout(wait);
  wait = setTimeout(getRelief,500);  // redraw after a delay in case map is moved again soon after
});

map.on('move', function() {
  // stop things so it doesn't redraw in the middle of panning
  clearTimeout(wait);
});

// custom tile layer for the Mapzen elevation tiles
// it returns div tiles but doesn't display anyting; images are saved but only drawn to an invisible canvas (demCanvas)
var CanvasLayer = L.GridLayer.extend({
  createTile: function(coords){
      var tile = L.DomUtil.create('div', 'leaflet-tile');
      var img = new Image();
      var self = this;
      img.crossOrigin = '';
      tile.img = img;
      img.onload = function() {
        // we wait for tile images to load before we can redraw the map
        clearTimeout(wait);
        wait = setTimeout(getRelief,500); // only draw after a reasonable delay, so that we don't redraw on every single tile load
      }
      img.src = 'http://elevation-tiles-prod.s3.amazonaws.com/terrarium/'+coords.z+'/'+coords.x+'/'+coords.y+'.png'
      return tile;
  }
});
var demLayer = new CanvasLayer().addTo(map);

// custom map pane for the flows, above other layers
var pane = map.createPane('flow');
pane.appendChild(flowCanvas);

// another custom pane for a second mapzen layer with large lakes (to mask flows across them)
// var lakesPane = map.createPane('lakes');
// var lakes = Tangram.leafletLayer({
//     scene: 'styles/lakes.yaml',
//     pane: 'lakes'
// }).addTo(map);

// this resets our canvas back to top left of the window after panning the map
// Mapzen layers do this internally; need it for the custom flow canvas layer
function reverseTransform() {
  var top_left = map.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(flowCanvas, top_left);
};

// document.getElementById('search').addEventListener('keydown', function (e) {
//   if (e.keyCode == 13) {
//     loadJSON('https://search.mapzen.com/v1/search?api_key=mapzen-GR9NVHq&text=' + this.value, function (result) {
//       if (result.features.length) {
//         var zoom;
//         map.setView([result.features[0].geometry.coordinates[1], result.features[0].geometry.coordinates[0]], 9);
//       }
//     });
//   }
// })

  var color = d3.scaleLinear()
    .domain([0, 6000])
    .range(["#a4ad9d", "#e5d9c9"])
    .interpolate(d3.interpolateHcl)

var frames;
var frameSets;
function getRelief(){
  // halt any running stuff
  clearInterval(frames);
  clearInterval(frameSets);
  // reset canvases
  flowContext.clearRect(0,0,width,height);
  demContext.clearRect(0,0,width,height);
  reverseTransform();

  // reset DEM data by drawing elevation tiles to it
  data = [];
  for (var t in demLayer._tiles) {
    var rect = demLayer._tiles[t].el.getBoundingClientRect();
    demContext.drawImage(demLayer._tiles[t].el.img,rect.left,rect.top);
  }
  demImageData = demContext.getImageData(0,0,width,height);
  demData = demImageData.data;

  //console.log(width, height, width*height*4, demData)

  var values = new Array(width*height);
  for (var y=0; y < height; y++) {
    for (var x=0; x < width; x++) {
      var i = getIndexForCoordinates(width, x,y);
      values[x + y*width] = Math.round(elev(i, demData) * 3.28084);
    }
  }

  var interval = 100;

  var max = Math.ceil(d3.max(values)/interval) * interval;
  var min = Math.floor(d3.min(values)/interval) * interval;
  // min = -20000;
  // max = 14000;
 console.log(min)

  var thresholds = [];
  for (var i=Math.min(0,min); i <= max; i += interval) {
    thresholds.push(i);
  }

  if (min < 0) {
    color.domain([min,-1,0,max]).range(['#12405e', '#a3c9e2', '#486341', '#e5d9c9'])
  } else {
    color.domain([min,max]).range(["#486341", "#e5d9c9"])
  }

  var contour = d3.contours()
    .size([width, height])
    .thresholds(thresholds)
  var contoursGeo = contour(values);
   

  console.log(contoursGeo)
  var path = d3.geoPath().context(flowContext);

  function drawContours() {
    flowContext.strokeStyle = 'rgba(255, 249, 229,.75)';
    flowContext.lineWidth = 3;
    flowContext.fillStyle = 'rgba(255,240,220,1)'; // fill is used for fading; apparently the color doesn't matter
    flowContext.shadowColor = '#a3927a';
    flowContext.shadowBlur = 2;
    flowContext.shadowOffsetX = 2;
    flowContext.shadowOffsetY = 2;
    contoursGeo.forEach(function (c) {
      if (c.value % 1000 == 0) flowContext.lineWidth = 2;
      else flowContext.lineWidth = 1;
         // console.log(flowContext.lineWidth)
      flowContext.beginPath();
             flowContext.fillStyle = color(c.value);

      path(c);
      if (c.value < 0) {
        flowContext.shadowColor = '#4e5c66';
        flowContext.strokeStyle = '#rgba(224, 242, 255, .25)';
      } else {
        flowContext.shadowColor = '#5b5143';
        flowContext.strokeStyle = 'rgba(255, 250, 234,.25)';
      }
      flowContext.stroke();
      flowContext.fill();
       
    });
  }

  //drawContours();
  
  function animateThing () {
    var i = contoursGeo.length-1;
    frames = setInterval(function () {
      if (--i < 0) {
        i = contoursGeo.length-1;
      }
      
      // flowContext.globalCompositeOperation = 'destination-out';
      // flowContext.fillStyle = '#fff';
      // flowContext.globalAlpha = 0.5;
      // flowContext.fillRect(0,0,width,height);
      // 

      //flowContext.globalAlpha = 1;
      flowContext.beginPath();
      flowContext.fillStyle = 'rgba(0,150,200,.4)';
      path(contoursGeo[i]);
      flowContext.fill();
      if (i < contoursGeo.length-1) {
        flowContext.save();
        flowContext.globalCompositeOperation = 'destination-out';
        flowContext.globalAlpha = 0.5;
        flowContext.beginPath();
        flowContext.fillStyle = '#fff';
        for (var n = i + 1; n < contoursGeo.length; n++) {
          path(contoursGeo[n]);
        }
        flowContext.fill();
        flowContext.restore();
      }
    },25);

  }
     // animateThing();

  function animateThing2 () {
    var color2 = d3.scaleLinear()
      .domain([min, max])
      .range(["rgba(200, 0, 143, 1)", "rgba(0,150,200,1)"])
      .interpolate(d3.interpolateHcl)
    frameSets = setInterval(addThing, 1000);
    flowContext.strokeStyle = 'rgba(0,150,200,1)';
    flowContext.lineWidth = 2;
    //flowContext.setLineDash([1, 10]);
    var anims = [];
    function addThing() {
      anims.push(contoursGeo.length - 1);
      console.log(anims.length)
    }
     //   addThing();

    frames = setInterval(function () {
      flowContext.save();
      flowContext.globalCompositeOperation = 'destination-out';
      flowContext.globalAlpha = 0.1;
      flowContext.fillRect(0,0,width,height);
      flowContext.restore();

      for (var a=0; a < anims.length; a++) {
        //console.log(color2[contoursGeo[anims[a]].value])
        flowContext.strokeStyle = color2(contoursGeo[anims[a]].value)
        flowContext.beginPath();
        path(contoursGeo[anims[a]]);
        flowContext.stroke();
        anims[a]--;
      }
      if (anims[0] == 0) anims.shift();  
    },100);

  }

  animateThing2();

  function animateThing3 () {
    var path2 = d3.geoPath();
    var svg = d3.select('body').append('svg').attr('width', width).attr('height', height).style('position', 'absolute').style('top', 0).style('left', 0)

    var data = contoursGeo.map(function (c){ return {offset: 0, contour: c}});

    svg.selectAll('path')
      .data(data)
      .enter()
      .append('path')
      .attr('d', function (d){ return path2(d.contour)})
      .style('fill', 'none')
      .style('stroke', '#eee')
      .style('stroke-dasharray', '25 10')
      .style('stroke-dashoffset', 0);

    frames = setInterval(function () {
      svg.selectAll('path')
        .style('stroke-dashoffset', function (d) {
          if (d.contour.value % 2000 == 0) {
            d.offset -= 1;
          } else {
            d.offset += 1;
          }
          if (d.offset == 35 || d.offset == -35) d.offset = 0;
          return d.offset;
        })
    }, 50)
    
  }


 // animateThing3()
}

function pause() {
  clearInterval(frameSets)
  clearInterval(frames)
}

// convert mapzen tile color to elevation value
function elev(index, demData) {
  if (index < 0 || demData[index] === undefined) return undefined;
  return (demData[index] * 256 + demData[index+1] + demData[index+2] / 256) - 32768;
}

// helper to get imageData index for a given x/y
function getIndexForCoordinates(width, x,y) {
  return width * y * 4 + 4 * x;
}


function loadJSON(path, success, error)
{
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function()
  {
      if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
              if (success)
                  success(JSON.parse(xhr.responseText));
          } else {
              if (error)
                  error(xhr);
          }
      }
  };
  xhr.open("GET", path, true);
  xhr.send();
}