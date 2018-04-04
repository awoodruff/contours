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
      values[x + y*width] = Math.round(elev(i, demData)); // converting meters to feet here. #USA!!!1
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
//interval /= 2;
  if (map.getZoom() < 14) interval *= 2; // attempting to factor in zoom level

  max = Math.ceil(max/interval) * interval;
  min = Math.floor(min/interval) * interval;

  // the countour line values
  thresholds = [];
  for (var i = min; i <= max; i += interval) {
    thresholds.push(i);
  }
  contour.thresholds(thresholds);
  

  contoursGeoData = contour(values);

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

function drawContours() {
  contourContext.clearRect(0,0,width,height);
  
  // contourContext.shadowBlur = r;
  // contourContext.shadowOffsetX = r * Math.cos(angle)
  // contourContext.shadowOffsetY = r * Math.sin(angle)

  var coords = [];
  var paths = [];

  contoursGeoData.forEach(function (c) {
    if (c.value == 0) return;
    coords = _.chain(c.coordinates).flatten(true).flatten(true).value().filter(function (coord, i) {return i % 1 == 0});
  
    coords.forEach(function (coord) {
      var path = createPath(coord.map(Math.round), c.value, c.value - interval);
          //console.log(c, path)

      if (path) {
        paths.push(path);
      }
    });
  })
  

  //console.log(paths)

  var line = d3.line().context(contourContext).curve(d3.curveBundle.beta(.5))

  contourContext.beginPath();
  contourContext.strokeStyle = 'white';
  contourContext.lineWidth = 0.25;
  paths.forEach(function (p) {
    if (Math.abs(p.coords[p.coords.length-2][0] -  p.coords[0][0]) > 500) return;
    line(p.coords.slice(0,-1));
    return;
    contourContext.moveTo(p.coords[0][0], p.coords[0][1]);
    for (var i = 1; i < p.coords.length - 1; i++) {
      //if (i < p.coords.length-2) continue;
      contourContext.lineTo(p.coords[i][0], p.coords[i][1]);
    }
  })
  contourContext.stroke();

  // contoursGeoData.forEach(function (c) {
  //   var filtered = _.chain(c.coordinates).flatten(true).flatten(true).value().filter(function (coord, i) {return i % 8 == 0})
  //   coords = coords.concat(filtered)
  // });
  // console.log(coords)

  // var delaunay = d3.Delaunay.from(coords);
  // console.log(delaunay)

  // contourContext.strokeStyle = 'white';
  // contourContext.lineWidth = 1;
  // var voronoi = delaunay.voronoi([0,0,width,height])
  // contourContext.beginPath();
  // //delaunay.render(contourContext);
  // for (var i = 0, n = delaunay.halfedges.length; i < n; ++i) {
  //   var j = delaunay.halfedges[i];
  //   if (j < i) continue;
  //   var ti = delaunay.triangles[i] * 2;
  //   var tj = delaunay.triangles[j] * 2;
  //   contourContext.moveTo(delaunay.points[ti], delaunay.points[ti + 1]);
  //   contourContext.lineTo(delaunay.points[tj], delaunay.points[tj + 1]);
  // }
  // contourContext.stroke();

// contourContext.beginPath();
// contourContext.strokeStyle = '#666666';
//   contoursGeoData.forEach(function (c) {
//     //contourContext.beginPath();
//     // if (c.value < 0) {
//     //   // blue-ish shadow and highlight colors below sea level
//     //   contourContext.shadowColor = '#4e5c66';
//     //   contourContext.strokeStyle = 'rgba(224, 242, 255, .25)';
//     // } else {
//     //   contourContext.shadowColor = '#5b5143';
//     //   contourContext.strokeStyle = 'rgba(255, 250, 234,.25)';
//     // }
//     //  contourContext.fillStyle = color(c.value);
//     // var coords = _.flatten(c.coordinates);
//     // console.log(coords)
//     // for (var i=0; i < coords.length; i+=8) {

//     //   contourContext.fillRect(coords[i], coords[i+1], 1, 1)
//     // }
//     path(c);
//     // draw the light stroke first, then the fill with drop shadow
//     // the effect is a light edge on side and dark on the other, giving the raised/illuminated contour appearance
//    // contourContext.stroke(); 
//     //contourContext.fill();
//   });
//   contourContext.stroke()
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

// for a given location, get the next lowest adjacent locaiton, i.e. where a flow would go from here
function getDataAtPoint (n,x,y) {
  if (elev(n,demData) < 1) {
    return;
  }
  
  var centerValue = elev(n,demData);
  
  /*
  look at nearby locations for the next lowest elevation, but not adjacent pixels
  going 3 or 4 pixels out, and also avoiding exact 45 degree angles, makes for a smoother look

  looking at the spots labeled X below. O is the current point

  - - - X X X - - -
  - - X - - - X - -
  - X - - - - - X -
  X - - - - - - - X
  X - - - O - - - X
  X - - - - - - - X
  - X - - - - - X -
  - - X - - - X - -
  - - - X X X - - -

  - - - - - - - - -
  - - - - - - - - -
  - - - X X X - - -
  - - X - - - X - -
  - - X - O - X - -
  - - X - - - X - -
  - - - X X X - - -
  - - - - - - - - -
  - - - - - - - - -
  */

  var nearby =[
    [-1,-4],
    [-1,4],
    [0,-4], // top, 2
    [0,4],  // bottom, 3
    [1,-4],
    [1,4],
    [-2,-3],  //topleft, 6
    [-2,3], // bottomleft, 7
    [2,-3], // topright, 8
    [2,3],  // bottomright, 9
    [-3,-2], // topleft, 10
    [-3,2], //bottomleft, 11
    [3,-2], // topright, 12
    [3,2], // bottomright, 13
    [-4,-1],
    [-4,0], // left, 15
    [-4,1], 
    [4,-1],
    [4,0],  // right, 18
    [4,1]
  ];
  // var nearby =[
  //   [-1,-1],
  //   [0,-1],
  //   [1,-1],
  //   [1,0],
  //   [1,1],
  //   [0,1],
  //   [-1,1],
  //   [-1,0]
  // ];

  // var nearby =[
  //   [-1,-2],
  //   [0,-2],
  //   [1,-2],
  //   [2,-1],
  //   [2,0],
  //   [2,1],
  //   [-1,2],
  //   [0,2],
  //   [1,2],
  //   [-2,-1],
  //   [-2,0],
  //   [-2,1]
  // ];

  var edge = false;
  var min = Infinity;
  var minVal;

  for (var c=0; c<nearby.length; c++) {
    index = getIndexForCoordinates(width, x + nearby[c][0], y + nearby[c][1]);
    var e = elev(index,demData);
    var val = [x + nearby[c][0], y + nearby[c][1], e];
    if (e !== undefined) {
      min = Math.min(min,e);
      if (e == min) minVal = val;
    }
    // rough check whether the trend is off screen; we'll stop here if so
    // avoids paths taking a sharp turn and running down the edge of the screen
    if (x == 0 && c == 18 && e > centerValue) edge = true;
    if (y == 0 && c == 3 && e > centerValue) edge = true;
    if (x == width-1 && c == 15 && e > centerValue) edge = true;
    if (y == height-1 && c == 2 && e > centerValue) edge = true;
  }

  // various checks for whether to keep the next point
  if (edge) return;
  if (!minVal || minVal[2] > centerValue) return;
  if (minVal[0] < 0 || minVal[0] >= width || minVal[1] < 0 || minVal[1] >= height) {
    //if (minVal[0] > 0 && minVal[0] < width) console.log(e, minVal)
    return;
  }

  // if all is good, store the next lowest point
  var next = [minVal[0], minVal[1]];

  data[n] = {v:centerValue, next: next};
}

function createPath (startCoords, startEl, endEl) {
  var keepGoing = true;
  var path = {count: 0, currentIndex: 0, coords:[startCoords]};
  var current;
  var recent = [startCoords];
  var x;
  var y;
  if (x == 0 || x == width || y == 0 || y == height) return;
  //console.log(startCoords);
  while (keepGoing) {
    // current point
    current = path.coords[path.coords.length-1];
    var x = current[0];
    var y = current[1];
    var i = getIndexForCoordinates(width, x, y);

    // if there is no data (i.e., elevation and 'next') at this point, calculate it
    if (!data[i]) getDataAtPoint(i,x,y);
    // if there's still no data after that, things will fail below and the path will end

    if (!demData[i] || elev(i, demData) <= endEl || !data[i]) { // check to make sure data exists here; honestly not sure what this is catching anymore
    // if (x != width && y != height && x !=0 && y != 0) console.log(x,y,demData[i], data[i], elev(i, demData), endEl)
      keepGoing = false;
    } else {
      // next point, according to data at this location
      var newX = data[i].next[0];
      var newY = data[i].next[1];

      // this bit checks if the path hasn't gotten very far after several steps
      // sometimes paths are super short or somehow get stuck at the end bouncing back and forth in a small space
      if (recent.length == 5) recent.shift();
      recent.push([newX,newY]);
      var dx = recent.length < 5 ? 999 : Math.abs(recent[2][0] - newX)
      var dy = recent.length < 5 ? 999 : Math.abs(recent[2][1] - newY)
      
      var i2 = getIndexForCoordinates(width, newX, newY);

      if (!demData[i2] || elev(i2,demData) > elev(i,demData) || elev(i2,demData) <= 0 || (dx < 3 && dy < 3)) {
        // if no data at next point, or next point is higher than current point, or path is too short, we're at the end
        // probably some old redundancy left over in some of those conditions, but you never know
        //if (console.log(elev(i2,demData), elev(i,demData))
        keepGoing = false;
      } else {
        // otherwise, add the new point
        path.coords[path.coords.length] = [newX, newY];
      }
    }
  }
  if (path.coords.length > 3) return path;  // discard path if too short
  return null;
}


// convert elevation tile color to elevation value
function elev(index, demData) {
  if (index < 0 || demData[index] === undefined) return undefined;
  return  3.28084 * ((demData[index] * 256 + demData[index+1] + demData[index+2] / 256) - 32768);
}

// helper to get imageData index for a given x/y
function getIndexForCoordinates(width, x,y) {
  return width * y * 4 + 4 * x;
}