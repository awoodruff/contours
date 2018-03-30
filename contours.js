// canvas on which all the flowing lines will be drawn, and some convenience variables
var contourCanvas = document.createElement('canvas');
contourCanvas.id='contours';
var contourContext;

// invisible canvas to which Mapzen elevation tiles will be drawn so we can calculate stuff
var demCanvas = document.createElement('canvas');
var demContext;
var demImageData;
var demData;

var contourContext = contourCanvas.getContext('2d');
var demContext = demCanvas.getContext('2d');

// not too big or this can get hella slow
var mapNode = d3.select('#map').node();
var width = mapNode.offsetWidth;
var height = mapNode.offsetHeight;
contourCanvas.width = width;
contourCanvas.height = height;
demCanvas.width = width;
demCanvas.height = height;

var path = d3.geoPath().context(contourContext);

var min;
var max;
var interval;
var majorInterval = 0;
var thresholds;
var contour = d3.contours()
    .size([width, height]);
var contoursGeoData;

var wait;

var type = 'lines';
var unit = 'ft';

var lineWidth = .75;
var lineWidthMajor = 1.5;
var lineColor = '#8c7556';

var highlightColor = '#B1AEA4';
var shadowColor = '#5b5143';
var shadowSize = 2;

window.onresize = function () {
  width = mapNode.offsetWidth;
  height = mapNode.offsetHeight;
  contourCanvas.width = width;
  contourCanvas.height = height;
  demCanvas.width = width;
  demCanvas.height = height;
  contour.size([width, height]);
  clearTimeout(wait);
  wait = setTimeout(getRelief,500);
}

d3.selectAll('.settings-row.type input').on('change', function () {
  type = d3.select('.settings-row.type input:checked').node().value;
  d3.select('#major').attr('disabled', type =='illuminated' ? 'disabled' : null);
  d3.select('#lines-style').style('display', type =='illuminated' ? 'none' : 'inline-block');
  d3.select('#illuminated-style').style('display', type =='illuminated' ? 'inline-block' : 'none');
  drawContours();
});

d3.select('#interval-input').on('keyup', function () {
  if (+this.value == interval) return;
  clearTimeout(wait);
  wait = setTimeout(getContours,500);
});

d3.selectAll('input[name="unit"]').on('change', function () {
  if (this.checked) unit = this.value;
  getContours();
})

d3.select('#major').on('change', function () {
  majorInterval = +this.value * interval;
  d3.select('#line-width-major').attr('disabled', majorInterval == 0 ? 'disabled' : null)
  drawContours();
});

d3.select('#line-width-major').on('keyup', function () {
  if (isNaN(this.value) || +this.value < 0) this.value = 1.5;
  lineWidthMajor = +this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#line-width').on('keyup', function () {
  if (isNaN(this.value) || +this.value < 0) this.value = .75;
  lineWidth = +this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#line-color').on('change', function () {
  lineColor = this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#highlight-color').on('change', function () {
  highlightColor = this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#shadow-color').on('change', function () {
  shadowColor = this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#shadow-width').on('keyup', function () {
  if (isNaN(this.value) || +this.value < 0) this.value = 2;
  shadowSize = +this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#settings-toggle').on('click', function () {
  d3.select('#settings').classed('show', !d3.select('#settings').classed('show'))
});

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

var map = L.map('map',{scrollWheelZoom: false});
var hash = new L.Hash(map);
map.setView(map_start_location.slice(0, 3), map_start_location[2]);

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

// custom map pane for the contours, above other layers
var labelPane = map.createPane('labels');
var referenceLayer = L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}.png', {pane:'labels', attribution:'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.'}).addTo(map);


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
  demContext.clearRect(0,0,width,height);
  reverseTransform();

  // reset DEM data by drawing elevation tiles to it
  for (var t in demLayer._tiles) {
    var rect = demLayer._tiles[t].el.getBoundingClientRect();
    demContext.drawImage(demLayer._tiles[t].el.img,rect.left,rect.top);
  }
  demImageData = demContext.getImageData(0,0,width,height);
  demData = demImageData.data;

  getContours();
}

function getContours () {
  var values = new Array(width*height);
  // get elevation values for pixels
  for (var y=0; y < height; y++) {
    for (var x=0; x < width; x++) {
      var i = getIndexForCoordinates(width, x,y);
      // x + y*width is the array position expected by the contours generator
      values[x + y*width] = Math.round(elev(i, demData) * (unit == 'ft' ? 3.28084 : 1)); // converting meters to feet here. #USA!!!1
    }
  }

  max = d3.max(values);
  min = d3.min(values);
   
  interval = +d3.select('#interval-input').node().value;

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

  d3.selectAll('#major option')
    .html(function () {
      if (+this.value == 0) return 'None';
      return +this.value * interval;
    });

  majorInterval = +d3.select('#major').node().value * interval;

  drawContours();
}

function drawContours() {
  contourContext.clearRect(0,0,width,height);
  contourContext.save();
  if (type == 'illuminated') {
    contourContext.lineWidth = shadowSize + 1;
    contourContext.shadowBlur = shadowSize;
    contourContext.shadowOffsetX = shadowSize;
    contourContext.shadowOffsetY = shadowSize;

    contoursGeoData.forEach(function (c) {
      contourContext.beginPath();
      if (c.value < 0) {
        // blue-ish shadow and highlight colors below sea level
        contourContext.shadowColor = '#4e5c66';
        contourContext.strokeStyle = 'rgba(224, 242, 255, .25)';
      } else {
        contourContext.shadowColor = shadowColor;
        contourContext.strokeStyle = highlightColor;
      }
      contourContext.fillStyle = color(c.value);
      path(c);
      // draw the light stroke first, then the fill with drop shadow
      // the effect is a light edge on side and dark on the other, giving the raised/illuminated contour appearance
      contourContext.stroke(); 
      contourContext.fill();
    });
  } else {
    contourContext.lineWidth = lineWidth;
    contourContext.strokeStyle = lineColor;
    contourContext.beginPath();
    contoursGeoData.forEach(function (c) {
      if (majorInterval == 0 || c.value % majorInterval != 0) path(c);
    });
    contourContext.stroke();
    if (majorInterval != 0) {
      contourContext.lineWidth = lineWidthMajor;
      contourContext.beginPath();
      contoursGeoData.forEach(function (c) {
        if (c.value % majorInterval == 0) path(c);
      });
      contourContext.stroke();
    }

  }
  contourContext.restore();
}

function toGeoJson () {
  var geojson = {type: 'FeatureCollection', features: []};
  contoursGeoData.forEach(function (c) {
    var feature = {type:'Feature', properties:{elevation: c.value}, geometry: {type:'MultiLineString', coordinates:[]}};
    geojson.features.push(feature);
    c.coordinates.forEach(function (poly) {
      var polygon = [];
      feature.geometry.coordinates.push(polygon);
      poly.forEach(function (ring) {
        var polyRing = [];
        polygon.push(polyRing);
        ring.forEach(function (coord) {
          var ll = map.containerPointToLatLng(coord);
          polyRing.push([ll.lng, ll.lat]);
        });
      });
    })
  });
  console.log(JSON.stringify(geojson));
}

// convert elevation tile color to elevation value
function elev(index, demData) {
  if (index < 0 || demData[index] === undefined) return undefined;
  return (demData[index] * 256 + demData[index+1] + demData[index+2] / 256) - 32768;
}

// helper to get imageData index for a given x/y
function getIndexForCoordinates(width, x,y) {
  return width * y * 4 + 4 * x;
}