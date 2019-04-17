var forcedInterval = 100;
var intervalMutliplier = 1;
var pathSpacing = 1;
var pathSegmentLength = 5;
var maxSegments = 100;
var numberOfShades = 8;
var lineWidth = 2;
var alpha = .025;
var pathColorScale;
var curve = d3.curveBundle.beta(.7);
var composite = 'overlay';
var maxContoursTraveled = 100;
var imageScale = 1;

var slices = 2 * (numberOfShades - 1);

// canvas on which all the flowing lines will be drawn, and some convenience variables
var contourCanvas = document.createElement('canvas');
contourCanvas.id='contours';
var contourContext;

var riverCanvas = document.createElement('canvas');
var riverContext = riverCanvas.getContext('2d');

// invisible canvas to which Mapzen elevation tiles will be drawn so we can calculate stuff
var demCanvas = document.createElement('canvas');
var demImageData;
var demData;

var imageCanvas = document.createElement('canvas');

var reliefImageData, reliefData;
var brighten = function(n){ return Math.sqrt(n*.8 + .2); };

var data = [];
var allPoints = {};

var contourContext = contourCanvas.getContext('2d');
var demContext = demCanvas.getContext('2d');
var imageContext = imageCanvas.getContext('2d');

// not too big or this can get hella slow
var width = window.innerWidth;
var height = window.innerHeight;
contourCanvas.width = width * imageScale;
contourCanvas.height = height * imageScale;
demCanvas.width = width;
demCanvas.height = height;
imageCanvas.width = width;
imageCanvas.height = height;
riverCanvas.width = contourCanvas.width;
riverCanvas.height = contourCanvas.height;
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

var blue = {r: 240, g: 240, b: 240};

var sunElev = Math.PI*.45;
var sunAzimuth = 1.75*Math.PI;
var sunAzimuth2 = .75*Math.PI;


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

function projectPoint(x, y) {
  var point = map.latLngToLayerPoint(new L.LatLng(y, x));
  if (Math.random() > .9999) console.log(this)
  this.stream.point(point.x, point.y);
}

var transform = d3.geoTransform({ point: projectPoint });
path = d3.geoPath().projection(transform).context(riverContext);

var water;
d3.json('ocean_lakes.geojson').then(function(json){
  water = json.features;
})

map.on('moveend', function() {
  // on move end we redraw the flow layer, so clear some stuff
 
  contourContext.clearRect(0,0,width * imageScale,height * imageScale);
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

var CanvasLayer2 = L.GridLayer.extend({
  createTile: function(coords){
      var tile = L.DomUtil.create('div', 'leaflet-tile');
      var img = new Image();
      var self = this;
      img.crossOrigin = '';
      tile.img = img;
      img.onload = function() {
        tile.appendChild(img)
        // we wait for tile images to load before we can redraw the map
        //clearTimeout(wait);
        //wait = setTimeout(getRelief,500); // only draw after a reasonable delay, so that we don't redraw on every single tile load
      }
      img.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+coords.z+'/'+coords.y+'/'+coords.x;
      return tile;
  }
});

var demLayer = new CanvasLayer({attribution: '<a href="https://aws.amazon.com/public-datasets/terrain/">Elevation tiles</a> by Mapzen'}).addTo(map);
var imageryLayer = new CanvasLayer2().addTo(map);
// var Esri_WorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
//   attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
// }).addTo(map);

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

var color2 = d3.scaleLinear().domain([0, 180]).range(['#ffe083', '#0c6eb9']).interpolate(d3.interpolateHcl);
var color3 = d3.scaleLinear().domain([0, 180]).range(['#fff', '#000']);
var color4 = d3.scaleLinear().domain([0, 180]).range(['#42f4b0', '#234da0']).interpolate(d3.interpolateHcl);
var color5 = d3.scaleLinear().domain([0, 180]).range(['#ffe083', '#5b81ff']).interpolate(d3.interpolateHcl);
var color6 = d3.scaleLinear().domain([0, 180]).range(['#ff6083', '#5b81ff']).interpolate(d3.interpolateHcl);
var color7 = d3.scaleLinear().domain([0, 180]).range(['#ffeb00', '##006195']).interpolate(d3.interpolateHclLong);
var color8 = d3.scaleLinear().domain([0, 100, 180]).range(['#ffde00', '#cd74aa', '#0048e4']).interpolate(d3.interpolateRgb.gamma(.5));
pathColorScale = color3;

var values;
var scale = d3.scaleSqrt();
var luminanceScale = d3.scaleSqrt().domain([0,1]).range([.2,.95]);
var luminanceWaterScale = d3.scaleSqrt().domain([0,1]).range([.2,.8]);

function getImagery() {
  imageContext.clearRect(0,0,width,height);
  for (var t in imageryLayer._tiles) {
    var rect = imageryLayer._tiles[t].el.getBoundingClientRect();
    console.log(imageryLayer._tiles[t].el.img)
    imageContext.drawImage(imageryLayer._tiles[t].el.img,rect.left,rect.top);
  }
  document.body.appendChild(imageCanvas)
}

function getRelief(){
  // reset canvases
  contourContext.clearRect(0,0,width * imageScale,height * imageScale);
  demContext.clearRect(0,0,width,height);
  reverseTransform();

  // reset DEM data by drawing elevation tiles to it
  for (var t in demLayer._tiles) {
    var rect = demLayer._tiles[t].el.getBoundingClientRect();
    demContext.drawImage(demLayer._tiles[t].el.img,rect.left,rect.top);
  }
  demImageData = demContext.getImageData(0,0,width,height);
  demData = demImageData.data;

  values = new Array(width*height);
  // get elevation values for pixels
  for (var y=0; y < height; y++) {
    for (var x=0; x < width; x++) {
      var i = getIndexForCoordinates(width, x,y);
      // x + y*width is the array position expected by the contours generator
      var val = Math.round(3.28084 * elev(i, demData));
      //if (val > 0) val = Math.pow(val / 2, .25) * 200
      values[x + y*width] = val; // converting meters to feet here. #USA!!!1
    }
  }

//   max = d3.max(values);
//   min = 0;//d3.min(values);

//   //contour.thresholds(20); // sets a contour interval so that there are approximately 20 steps between min and max
  
//   if (max - min > 7500) {
//     interval = 500;
//   } else if (max - min > 3000) {
//     interval = 100;
//   } else {
//     interval = 50;
//   }
// //interval /= 4;
//   //if (map.getZoom() < 14) interval *= 2; // attempting to factor in zoom level
// //interval = 100;
//   interval *= intervalMutliplier;

//   // alternatively, try to set a contour interval based on elevation range and zoom level
//   if (forcedInterval) interval = forcedInterval;

//   max = Math.ceil(max/interval) * interval;
//   min = Math.floor(min/interval) * interval;

//   // the countour line values
//   thresholds = [];
//   for (var i = min; i <= max; i += interval) {
//     thresholds.push(i);
//   }
//   contour.thresholds(thresholds);
  

//   contoursGeoData = contour(values);
//   console.log(contoursGeoData)

//   if (min < 0) {
//     // include blue bathymetric colors if anything is below sea level
//     color.domain([min,-1,0,max]).range(['#12405e', '#a3c9e2', '#486341', '#e5d9c9'])
//   } else {
//     // otherwise just a green to tan range
//     color.domain([min,max]).range(["#486341", "#e5d9c9"])
//   }

  var range = d3.extent(values);
  scale.domain(range).range(range);

  reliefImageData = contourContext.getImageData(0,0,width,height);
  reliefData = reliefImageData.data;
  tints = d3.scaleSqrt().domain([0, d3.max(values)]).range(['#eeffe5','#ffeee5']).interpolate(d3.interpolateHclLong)
  var shadeRange = ['#223', '#fff', '#7f7f7f'];//['#4757AD', '#FFFA93', '#fff'];
  var shadeDomain = [.6,.75,.8];
  shades = d3.scaleLinear().domain(shadeDomain).range(shadeRange).clamp(true).interpolate(d3.interpolateHcl);
  drawRelief();
  var waterColor = 'rgb(203,218,221)'
  //'rgb(203,218,221)'
  contourContext.globalCompositeOperation = 'multiply';
  //contourContext.globalAlpha = .9;
  riverContext.clearRect(0,0,riverCanvas.width,riverCanvas.height);
  riverContext.fillStyle = waterColor
  riverContext.strokeStyle = waterColor;
  riverContext.lineJoin = 'round';
  riverContext.lineWidth = 2;
  riverContext.beginPath();
  water.forEach(function (d) {
    path(d);
  });
  riverContext.fill();
  //riverContext.stroke();
 // contourContext.drawImage(riverCanvas,0,0);
  contourContext.globalCompositeOperation = 'source-over';

  for ( x = 0; x < width; x++ ) {
      for ( y = 0; y < height; y++ ) {
         var number =Math.random() * .05;
 
         contourContext.fillStyle = "rgba(255,255,255," + number + ")";
         contourContext.fillRect(x, y, 3, 3);
      }
   }
}

var angle = Math.PI / 4;
var r = 2;
var halfpi = Math.PI/2;
  var pi = Math.PI;

  var svg = d3.select('body').append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'none');

var rad = Math.PI / 180;

var tints;
var shades;

function drawRelief(){

  console.log('draw')

 var lums = [];
  
  for ( var n=0; n<demData.length; n+=4) {
     var el = values[n/4];
    // in the Molokai image, value 0 is ocean
    // if (el < 1) {
    //   reliefData[n] = blue.r;
    //   reliefData[n+1] = blue.g;
    //   reliefData[n+2] = blue.b;
    //   reliefData[n+3] = 255;
    //   continue;
    // }

    var x = (n / 4) % width;
    var y = Math.floor((n / 4) / width);

    var slopeAndAspect = getSlopeAndAspect([x,y],n)

    if (!slopeAndAspect) {
      reliefData[n] = blue.r;
      reliefData[n+1] = blue.g;
      reliefData[n+2] = blue.b;
      reliefData[n+3] = 255;
      continue;
    }

    var sl0 = Math.sqrt(slopeAndAspect[1] * rad);
    var azimuth = slopeAndAspect[0]



    // get luminance
    var lum = Math.cos( azimuth - sunAzimuth )*Math.cos( Math.PI*.5 - Math.atan(sl0) )*Math.cos( sunElev ) +  Math.sin( Math.PI*.5 - Math.atan(sl0) )*Math.sin( sunElev );
    var lum2 = Math.cos( azimuth - sunAzimuth2 )*Math.cos( Math.PI*.5 - Math.atan(sl0) )*Math.cos( sunElev ) +  Math.sin( Math.PI*.5 - Math.atan(sl0) )*Math.sin( sunElev );
    //lum = .75 * lum + .25 * lum2;
    if (lum<0) lum = 0;
   
    //if (el > 0) {
      lum = luminanceScale(lum);
    //  lums.push(lum);
    //} 
    //else lum = luminanceWaterScale(lum);
    
    //if (Math.random() > .999) console.log(lum)

    //var color = d3.color(tints(el));  // hypsometric tint color - see tints.js
    var w = '#effbff';
    //var color = el <= 100 ? d3.color('#EBF4DC') : d3.color(shades(lum))
    var color = d3.color(shades(lum))
    // some kind of multiply blend
    reliefData[n] = parseInt( lum * color.r);
    reliefData[n+1] = parseInt( lum * color.g);
    reliefData[n+2] = parseInt( lum * color.b);
    reliefData[n+3] = 255;
  }
  contourContext.putImageData(reliefImageData,0,0);
}



function polarToCartesian (r, theta) {
  return {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta)
  }
}

var cellSize = 3;
var halfCell = Math.floor(cellSize/2);
var squaredCell = cellSize * cellSize
// for a given location, get the next lowest adjacent locaiton, i.e. where a flow would go from here
function getSlopeAndAspect (coords, n) {

  var x = Math.round(coords[0]);
  var y = Math.round(coords[1]);

  if (n === undefined) n = getIndexForCoordinates(width,x,y);

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
          var val = values[cellX + cellY * width];
          if (val !== undefined) avg += val;
        }
      }
      avg /= squaredCell;
      cells[row + 1][col + 1] = avg;
    }
  }

 // if (Math.random() > .999) console.log(cells)

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

  var slx = (f - d)/3;
  var sly = ( h - b )/3;
  var sl0 = Math.sqrt( slx*slx + sly*sly );

  //if (Math.abs(aspect-270 < .1)) console.log(cells)
  return [aspect, sl0];
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

window.onclick = function(e) {
  var i = getIndexForCoordinates(width, e.pageX, e.pageY);
  console.log(i)
  console.log(elev(i, demData));
}

var zFactor = 10;

// convert elevation tile color to elevation value
function elev(index, demData) {
  if (!demData) return 0;
  if (index < 0 || demData[index] === undefined) return undefined;
  return  ((demData[index] * 256 + demData[index+1] + demData[index+2] / 256) - 32768) *zFactor;
}

// helper to get imageData index for a given x/y
function getIndexForCoordinates(width, x,y) {
  return width * y * 4 + 4 * x;
}