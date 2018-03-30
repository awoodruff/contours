// canvas on which all the flowing lines will be drawn, and some convenience variables
var contourCanvas = document.createElement('canvas');
contourCanvas.id='contours';
var contourContext;
var buffer = 5;

// invisible canvas to which Mapzen elevation tiles will be drawn so we can calculate stuff
var demCanvas = document.createElement('canvas');
var demContext;
var demImageData;
var demData;

var contourContext = contourCanvas.getContext('2d');
var demContext = demCanvas.getContext('2d');

// not too big or this can get hella slow
var mapNode = d3.select('#map').node();
var width = mapNode.offsetWidth + 2*buffer;
var height = mapNode.offsetHeight + 2*buffer;
contourCanvas.width = width;
contourCanvas.height = height;
demCanvas.width = width;
demCanvas.height = height;

var path = d3.geoPath().context(contourContext);
var svgPath = d3.geoPath();

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

var colorType = 'none';
var solidColor = '#fffcfa';
var hypsoColor = d3.scaleLinear()
  .domain([0, 6000])
  .range(["#486341", "#e5d9c9"])
  .interpolate(d3.interpolateHcl);

var contourSVG;

window.onresize = function () {
  width = mapNode.offsetWidth + 2*buffer;
  height = mapNode.offsetHeight + 2*buffer;
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
  d3.select('#settings').classed('show', !d3.select('#settings').classed('show'));
  d3.select('#download').classed('show', false);
});

d3.select('#download-toggle').on('click', function () {
  d3.select('#download').classed('show', !d3.select('#download').classed('show'));
  d3.select('#settings').classed('show', false);
});

d3.selectAll('input[name="bg"]').on('change', function () {
  if (d3.select('#no-bg').node().checked) {
    d3.select('#solid-style').classed('disabled', true);
    d3.select('#hypso-style').classed('disabled', true);
    colorType = 'none';
  } else if (d3.select('#solid-bg').node().checked) {
    d3.select('#solid-style').classed('disabled', false);
    d3.select('#hypso-style').classed('disabled', true);
    colorType = 'solid';
  } else {
    d3.select('#solid-style').classed('disabled', true);
    d3.select('#hypso-style').classed('disabled', false);
    colorType = 'hypso';
  }
  d3.selectAll('#solid-style input, #hypso-style input').attr('disabled', null);
  d3.selectAll('.disabled input').attr('disabled', 'disabled');
  drawContours();
})

d3.select('#solid-color').on('change', function () {
  solidColor = this.value;
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#hypso-low-color').on('change', function () {
  hypsoColor.range([this.value, hypsoColor.range()[1]]);
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.select('#hypso-high-color').on('change', function () {
  hypsoColor.range([hypsoColor.range()[0], this.value]);
  clearTimeout(wait);
  wait = setTimeout(drawContours,500);
});

d3.selectAll('#download-geojson, .settings-row.geojson .settings-title').on('click', downloadGeoJson);
d3.selectAll('#download-png, .settings-row.png .settings-title').on('click', downloadPNG);
d3.selectAll('#download-svg, .settings-row.svg .settings-title').on('click', downloadSVG);

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

reverseTransform();

// this resets our canvas back to top left of the window after panning the map
function reverseTransform() {
  var top_left = map.containerPointToLayerPoint([-buffer, -buffer]);
  L.DomUtil.setPosition(contourCanvas, top_left);
};

function getRelief(){
  // reset canvases
  demContext.clearRect(0,0,width,height);
  reverseTransform();

  // reset DEM data by drawing elevation tiles to it
  for (var t in demLayer._tiles) {
    var rect = demLayer._tiles[t].el.getBoundingClientRect();
    demContext.drawImage(demLayer._tiles[t].el.img,rect.left + buffer,rect.top + buffer);
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

  //if (min < 0) {
    // include blue bathymetric colors if anything is below sea level
   // hypsoColor.domain([min,-1,0,max]).range(['#12405e', '#a3c9e2', '#486341', '#e5d9c9'])
  //} else {
    // otherwise just a green to tan range
    hypsoColor.domain([min,max]);
  //}

  d3.selectAll('#major option')
    .html(function () {
      if (+this.value == 0) return 'None';
      return +this.value * interval;
    });

  majorInterval = +d3.select('#major').node().value * interval;

  drawContours();
}

function drawContours(svg) {
  if (!svg) {
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
        if (colorType == 'hypso')
          contourContext.fillStyle = hypsoColor(c.value);
        else if (colorType == 'solid') contourContext.fillStyle = solidColor;
        else contourContext.fillStyle = '#fff';
        path(c);
        // draw the light stroke first, then the fill with drop shadow
        // the effect is a light edge on side and dark on the other, giving the raised/illuminated contour appearance
        contourContext.stroke(); 
        contourContext.fill();
      });
    } else {
      contourContext.lineWidth = lineWidth;
      contourContext.strokeStyle = lineColor;
      if (colorType != 'hypso') {
        contourContext.beginPath();
        contoursGeoData.forEach(function (c) {
          if (majorInterval == 0 || c.value % majorInterval != 0) path(c);
        });
        if (colorType == 'solid') {
          contourContext.fillStyle = solidColor;
          contourContext.fill();
        }
        contourContext.stroke();
      } else {
        contoursGeoData.forEach(function (c) {
          contourContext.beginPath();
          if (majorInterval == 0 || c.value % majorInterval != 0) path(c);
          contourContext.fillStyle = hypsoColor(c.value);
          contourContext.fill();
          contourContext.stroke();
        });
      }
      
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
  } else {
    if (!contourSVG) {
      contourSVG = d3.select('body').append('svg');
    }
    contourSVG
      .attr('width', width)
      .attr('height', height)
      .selectAll('path').remove();

    contourSVG.selectAll('path.stroke')
      .data(contoursGeoData)
      .enter()
      .append('path')
      .attr('d', svgPath)
      .attr('stroke', type == 'lines' ? lineColor : highlightColor)
      .attr('stroke-width', function (d) {
        return type == 'lines' ? (majorInterval != 0 && d.value % majorInterval == 0 ? lineWidthMajor : lineWidth) : shadowSize;
      })
      .attr('fill', function (d) {
        if (colorType == 'solid') {
          return solidColor;
        } else if (colorType == 'hypso') {
          return hypsoColor(d.value);
        } else {
          return 'none';
        }
      })
      .attr('id', function (d) {
        return 'elev-' + d.value;
      });
  }
}

function downloadGeoJson () {
  var geojson = {type: 'FeatureCollection', features: []};
  contoursGeoData.forEach(function (c) {
    var feature = {type:'Feature', properties:{elevation: c.value}, geometry: {type:c.type, coordinates:[]}};
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
  download(JSON.stringify(geojson), 'countours.geojson');
}

function downloadPNG () {
  var newCanvas = document.createElement('canvas');
  newCanvas.width = width - 2*buffer;
  newCanvas.height = height - 2*buffer;
  newCanvas.getContext('2d').putImageData(contourContext.getImageData(0,0,width,height), -buffer, -buffer)
  // https://stackoverflow.com/questions/12796513/html5-canvas-to-png-file
  var dt = newCanvas.toDataURL('image/png');
  /* Change MIME type to trick the browser to downlaod the file instead of displaying it */
  dt = dt.replace(/^data:image\/[^;]*/, 'data:application/octet-stream');

  /* In addition to <a>'s "download" attribute, you can define HTTP-style headers */
  dt = dt.replace(/^data:application\/octet-stream/, 'data:application/octet-stream;headers=Content-Disposition%3A%20attachment%3B%20filename=Canvas.png');

  var tempLink = document.createElement('a');
  tempLink.style.display = 'none';
  tempLink.href = dt;
  tempLink.setAttribute('download', 'contours.png');
  if (typeof tempLink.download === 'undefined') {
      tempLink.setAttribute('target', '_blank');
  }
  
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
}

function downloadSVG () {
  drawContours(true);
  var svgData = contourSVG.node().outerHTML;
  download(svgData, 'contours.svg', 'image/svg+xml;charset=utf-8')
}

// https://github.com/kennethjiang/js-file-download
function download(data, filename, mime) {
    var blob = new Blob([data], {type: mime || 'application/octet-stream'});
    if (typeof window.navigator.msSaveBlob !== 'undefined') {
        // IE workaround for "HTML7007: One or more blob URLs were 
        // revoked by closing the blob for which they were created. 
        // These URLs will no longer resolve as the data backing 
        // the URL has been freed."
        window.navigator.msSaveBlob(blob, filename);
    }
    else {
        var blobURL = window.URL.createObjectURL(blob);
        var tempLink = document.createElement('a');
        tempLink.style.display = 'none';
        tempLink.href = blobURL;
        tempLink.setAttribute('download', filename); 
        
        // Safari thinks _blank anchor are pop ups. We only want to set _blank
        // target if the browser does not support the HTML5 download attribute.
        // This allows you to download files in desktop safari if pop up blocking 
        // is enabled.
        if (typeof tempLink.download === 'undefined') {
            tempLink.setAttribute('target', '_blank');
        }
        
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        window.URL.revokeObjectURL(blobURL);
    }
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