// canvas on which all the flowing lines will be drawn, and some convenience variables
var contourCanvas = document.createElement('canvas');
contourCanvas.id='contours';
var contourContext;

// invisible canvas to which Mapzen elevation tiles will be drawn so we can calculate stuff
var demCanvas = document.createElement('canvas');
var demContext;
var demImageData;
var demData;

var data = [];
var allPoints = {};

var contourContext = contourCanvas.getContext('2d');
var demContext = demCanvas.getContext('2d');

// not too big or this can get hella slow
var width = window.innerWidth;
var height = window.innerHeight;
contourCanvas.width = width;
contourCanvas.height = height;
demCanvas.width = width;
demCanvas.height = height;
document.getElementById('map').style.width = width + 'px';
document.getElementById('map').style.height = height + 'px';

var path = d3.geoPath().context(contourContext);
var pathsvg = d3.geoPath();

var min;
var max;
var interval;
var thresholds;
var contour = d3.contours()
    .size([width, height]);
var contoursGeoData;

var wait;


var exampleLocations = [
  {name: 'Mount Fuji', coords: [35.3577, 138.7331, 13]},
  {name: 'Big Island, Hawaii', coords: [19.6801, -155.5132, 9]},
  {name: 'Grand Canyon', coords: [36.0469, -113.8416, 13]},
  {name: 'Mount Everest', coords: [27.9885, 86.9233, 12]},
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

L.control.zoom({position:'bottomright'}).addTo(map);

map.on('moveend', function() {
  // on move end we redraw the flow layer, so clear some stuff
 
  contourContext.clearRect(0,0,width,height);
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
var demLayer = new CanvasLayer({attribution: '<a href="https://aws.amazon.com/public-datasets/terrain/">Elevation tiles</a> by Mapzen'}).addTo(map);

// custom map pane for the contours, above other layers
var pane = map.createPane('contour');
pane.appendChild(contourCanvas);

// this resets our canvas back to top left of the window after panning the map
function reverseTransform() {
  var top_left = map.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(contourCanvas, top_left);
};

var color = d3.scaleLinear()
  .domain([0, 6000])
  .range(["#a4ad9d", "#e5d9c9"])
  .interpolate(d3.interpolateHcl);

function getRelief(){
  // reset canvases
  contourContext.clearRect(0,0,width,height);
  demContext.clearRect(0,0,width,height);
  reverseTransform();

  // reset DEM data by drawing elevation tiles to it
  for (var t in demLayer._tiles) {
    var rect = demLayer._tiles[t].el.getBoundingClientRect();
    demContext.drawImage(demLayer._tiles[t].el.img,rect.left,rect.top);
  }
  demImageData = demContext.getImageData(0,0,width,height);
  demData = demImageData.data;

  var values = new Array(width*height);
  // get elevation values for pixels
  for (var y=0; y < height; y++) {
    for (var x=0; x < width; x++) {
      var i = getIndexForCoordinates(width, x,y);
      // x + y*width is the array position expected by the contours generator
      values[x + y*width] = Math.round(3.28084 * elev(i, demData)); // converting meters to feet here. #USA!!!1
    }
  }

  max = d3.max(values);
  min = 0;//d3.min(values);

  //contour.thresholds(20); // sets a contour interval so that there are approximately 20 steps between min and max

  // alternatively, try to set a contour interval based on elevation range and zoom level
  
  
  if (max - min > 7500) {
    interval = 500;
  } else if (max - min > 3000) {
    interval = 100;
  } else {
    interval = 50;
  }
interval /= 8;
  if (map.getZoom() < 14) interval *= 2; // attempting to factor in zoom level
//interval = 100;
  max = Math.ceil(max/interval) * interval;
  min = Math.floor(min/interval) * interval;

  // the countour line values
  thresholds = [];
  for (var i = min; i <= max; i += interval) {
    thresholds.push(i);
  }
  contour.thresholds(thresholds);
  

  contoursGeoData = contour(values);
  console.log(contoursGeoData)

  if (min < 0) {
    // include blue bathymetric colors if anything is below sea level
    color.domain([min,-1,0,max]).range(['#12405e', '#a3c9e2', '#486341', '#e5d9c9'])
  } else {
    // otherwise just a green to tan range
    color.domain([min,max]).range(["#486341", "#e5d9c9"])
  }

  drawContours();
}

var angle = Math.PI / 4;
var r = 2;
var halfpi = Math.PI/2;
  var pi = Math.PI;

  var svg = d3.select('body').append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'none');

function drawContours() {
  contourContext.clearRect(0,0,width,height);
  svg.selectAll('path').remove();
  
  // contourContext.shadowBlur = r;
  // contourContext.shadowOffsetX = r * Math.cos(angle)
  // contourContext.shadowOffsetY = r * Math.sin(angle)

  var coords = [];
  var i;
  var l;
  var angle;

  data = [];
  allPoints = {};

  
  contourContext.lineWidth = 0.5;

  // contourContext.beginPath();
  // contourContext.strokeStyle = 'red';
  // contourContext.lineWidth = 0.5;
  // path(contoursGeoData[13]);
  // contourContext.stroke();

  var line = d3.line().context(contourContext).curve(d3.curveBundle.beta(.5))


  for (var j = contoursGeoData.length-1; j > 0; j--) {
   // continue;
    var c = contoursGeoData[j];
   // if (c.value !=5000) continue;
    var paths = [];


    c.coordinates.forEach(function (poly) {
      poly.forEach(function (ring) {
        var current;
        var d3Path = svg.append('path')
          .datum({type:'LineString', coordinates: ring})
          .attr('d', pathsvg);
        var length = d3Path.node().getTotalLength();
        var ringCoords = [];
        for (var pt = 0; pt < length; pt += 3) {
          var coord = d3Path.node().getPointAtLength(pt);
          ringCoords.push([coord.x,coord.y])  
        }
        l = ringCoords.length;
        //return;
        for (i = 0; i < l; i++) {
          if (!current) current = ringCoords[i];
         // else if (Math.abs(ringCoords[i][0] - current[0]) < 3 && Math.abs(ring[i][1] - current[1]) < 3) continue;
          // if (i > l - 3) continue;
          // angle = getAspect(ring[i]) - halfpi;
          // p = polarToCartesian(10, angle);

          // contourContext.moveTo(ring[i][0], ring[i][1]);
          // contourContext.lineTo(ring[i][0] + p.x, ring[i][1] + p.y)
          var p = getPath(ringCoords[i], (c.value - interval)/3.28084, c.value);
          if (p) paths.push(p);

          
        }
      })
    });

   // continue;

   var numberOfShades = 5;
   var slices = 2 * (numberOfShades - 1);

    var pathGroups = new Array(numberOfShades);
    var colors = [];
    for (var a = 0; a < numberOfShades; a ++) {
      pathGroups[a] = [];
      var v = 204 - a * (204/(numberOfShades-1));
      colors.push('rgb(' + [v,v,v].join(',') + ')')
    }
    // light, medium, dark

    var slice = pi*2/slices;
    var minLightAngle = 1.75 * pi - (slice/2);
   
    var delta;
    var slicesAway;
    paths.forEach(function (p) {
      if (p.aspect < 0) p.aspect += pi*2;
      delta = p.aspect - minLightAngle;
      if (delta < 0 ) delta += 2*pi;
      slicesAway = Math.ceil(delta/slice);
      if (slicesAway > numberOfShades) slicesAway = 2 * numberOfShades - slicesAway;
      slicesAway--;
     // console.log(slicesAway)
      pathGroups[slicesAway].push(p);
      // if (p.aspect > 1.5 * pi) pathGroups[0].push(p);
      // else if (p.aspect > halfpi && p.aspect < pi) pathGroups[2].push(p);
      // else pathGroups[1].push(p);
    });

    //console.log(pathGroups)

    for (var pg = 0; pg < pathGroups.length; pg ++) {
      if (!pathGroups[pg]) continue;
      contourContext.beginPath();
      contourContext.strokeStyle = colors[pg];
      // if (pg == 2) contourContext.strokeStyle = 'black';
      // else if (pg == 1) contourContext.strokeStyle = '#666';
      // else contourContext.strokeStyle = '#ccc';
      // if (pg == 2) contourContext.strokeStyle = 'black';
      // else if (pg == 1) contourContext.strokeStyle = 'red';
      // else contourContext.strokeStyle = 'blue';
      contourContext.lineWidth = .25// + pg / numberOfShades;
      pathGroups[pg].forEach(function (p) {
        line(p.coords);
      })
      contourContext.stroke();
    }



    // contourContext.save();
    // contourContext.globalCompositeOperation = 'destination-in';
    // contourContext.beginPath();
    // contourContext.fillStyle = '#fff';
    // path(contoursGeoData[j-1]);
    // contourContext.fill();
    // contourContext.restore();

    // contourContext.save();
    // contourContext.globalCompositeOperation = 'destination-out';
    // contourContext.beginPath();
    // contourContext.strokeStyle = '#fff';
    // contourContext.lineWidth = .5;
    // path(c);
    // contourContext.stroke();
    // contourContext.restore();
  }

  contoursGeoData.forEach(function (c){
    return;
    contourContext.beginPath();
    contourContext.strokeStyle = 'red';
    path(c);
    contourContext.stroke();
  })
   
  


  
  
}

var playing;
function play () {
  playing = true;
  requestAnimationFrame(animate);
}
function animate () {
  angle += Math.PI/16;
  drawContours();
  if (playing) requestAnimationFrame(animate);
}
function stop() {
  playing = false;
}

function polarToCartesian (r, theta) {
  return {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta)
  }
}

function getPath(coords, endEl, contour) {
  var path = [coords];
  var index;
  var aspect;
  var el = 50000;
  endEl = 0;
  var p;
  var i = 0;
  var avgAspect = 0;
  var next;
  while (el > endEl) {
    i++;
    index = getIndexForCoordinates(width, Math.round(path[path.length-1][0]), Math.round(path[path.length-1][1]));
    aspect = getAspect(path[path.length-1], index);
    el = elev(index, demData);
    if (isNaN(aspect) || aspect === undefined) break;
    if (isNaN(el) || !el) break;
    if (i > 50) break;
    avgAspect += aspect;
    p = polarToCartesian(3, aspect - halfpi);
    next = [Math.round(path[path.length-1][0] + p.x), Math.round(path[path.length-1][1] + p.y)];
    if (next[0] < 0 || next[0] > width || next[1] < 0 || next[1] > height) break;
   // if (!allPoints[next[0]] || !allPoints[next[0]][next[1]] || !allPoints[next[0]][next[1]].indexOf(contour) == -1) {
      path.push(next);
    //   if (!allPoints[next[0]]) allPoints[next[0]] = {};
    //   if (!allPoints[next[0]][next[1]]) allPoints[next[0]][next[1]] = [];
    //   allPoints[next[0]][next[1]].push(contour);
    // } else {
    //   break;
    // }
  }
  if (path.length > 1) return {coords: path, aspect: avgAspect/i};
}

var cellSize = 3;
var halfCell = Math.floor(cellSize/2);
var squaredCell = cellSize * cellSize
// for a given location, get the next lowest adjacent locaiton, i.e. where a flow would go from here
function getAspect (coords, n) {

  var x = Math.round(coords[0]);
  var y = Math.round(coords[1]);

  if (n === undefined) n = getIndexForCoordinates(width,x,y);
  if (data[n] !== undefined) return data[n];

  var cells = [[], [], []];

  if (x < 10 || x > width - 10 || y < 10 || y > height - 10) return;

  for (var row = -1; row <= 1; row ++) {
    for (var col = -1; col <= 1; col++) {
      if (row == 0 && col == 0) continue;
      var cx = x + col * cellSize;
      var cy = y + row * cellSize;
      var avg = 0;
      for (var cellX = cx - halfCell; cellX <= cx + halfCell; cellX++) {
        for (var cellY = cy - halfCell; cellY <= cy +halfCell ; cellY++) {
          var index = getIndexForCoordinates(width, cellX, cellY);
          var val = elev(index, demData);
          if (val !== undefined) avg += val;
        }
      }
      avg /= squaredCell;
      cells[row + 1][col + 1] = avg;
    }
  }

  var a = cells[0][0],
    b = cells[0][1],
    c = cells[0][2],
    d = cells[1][0],
    e = cells[1][1],
    f = cells[1][2],
    g = cells[2][0],
    h = cells[2][1],
    i = cells[2][2];

  var dx = ((c + 2*f + i) - (a + 2*d + g)) / 8;
  var dy = ((g + 2*h + i) - (a + 2*b + c)) / 8;
  var aspect = 57.29578 * Math.atan2 (dy, -dx);
  if (aspect < 0)
    aspect = 90.0 - aspect 
  else if (aspect > 90.0)
    aspect = 360.0 - aspect + 90.0
  else
    aspect = 90.0 - aspect;

  aspect /= 57.29578;

  data[n] = aspect;
  //if (Math.abs(aspect-270 < .1)) console.log(cells)
  return aspect;
  /*
  http://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-aspect-works.htm
  
  A  B  C

  D  E  F

  G  H  I

  [dz/dx] = ((c + 2f + i) - (a + 2d + g)) / 8

  [dz/dy] = ((g + 2h + i) - (a + 2b + c)) / 8
  
  aspect = 57.29578 * atan2 ([dz/dy], -[dz/dx])

  if aspect < 0
    cell = 90.0 - aspect  else if aspect > 90.0
    cell = 360.0 - aspect + 90.0
  else
    cell = 90.0 - aspect


  */
}

// convert elevation tile color to elevation value
function elev(index, demData) {
  if (index < 0 || demData[index] === undefined) return undefined;
  return  ((demData[index] * 256 + demData[index+1] + demData[index+2] / 256) - 32768);
}

// helper to get imageData index for a given x/y
function getIndexForCoordinates(width, x,y) {
  return width * y * 4 + 4 * x;
}