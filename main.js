import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Map from "ol/Map.js";
import OSM from "ol/source/OSM.js";
import VectorSource from "ol/source/Vector.js";
import View from "ol/View.js";
import { Stroke, Style, Icon } from "ol/style.js";
import { Tile as TileLayer, Vector as VectorLayer } from "ol/layer.js";
import { getVectorContext } from "ol/render.js";
import { getWidth } from "ol/extent.js";
import flightsData from "./flightsData";
import { Point } from "ol/geom";
import Overlay from "ol/Overlay.js";
import { transform } from "ol/proj.js";
import { toLonLat } from "ol/proj.js";
import { toStringHDMS } from "ol/coordinate.js";

/**
 * Elements that make up the popup.
 */
const container = document.getElementById("popup");
const content = document.getElementById("popup-content");
const closer = document.getElementById("popup-closer");

/**
 * Create an overlay to anchor the popup to the map.
 */
const overlay = new Overlay({
  element: container,
  autoPan: {
    animation: {
      duration: 250,
    },
  },
});

const tileLayer = new TileLayer({
  source: new OSM(),
});

const map = new Map({
  layers: [tileLayer],
  overlays: [overlay],
  target: "map",
  view: new View({
    center: [0, 0],
    zoom: 3,
  }),
});

const style = new Style({
  stroke: new Stroke({
    color: "#EAE911",
    width: 3,
  }),
});

const flightsSource = new VectorSource({
  loader: function () {
    for (let i = 0; i < flightsData.length; i++) {
      const flight = flightsData[i];
      const from = flight[0];
      const to = flight[1];

      // create an arc circle between the two locations
      const arcGenerator = new arc.GreatCircle(
        { x: from[1], y: from[0] },
        { x: to[1], y: to[0] }
      );

      const arcLine = arcGenerator.Arc(100, { offset: 10 });
      // paths which cross the -180°/+180° meridian are split
      // into two sections which will be animated sequentially
      const features = [];
      arcLine.geometries.forEach(function (geometry) {
        const line = new LineString(geometry.coords);
        line.transform("EPSG:4326", "EPSG:3857");

        const startIcon = new Feature({
          geometry: new Point(line.getFirstCoordinate()),
          name: "start",
          finished: false,
        });
        startIcon.setStyle(
          new Style({
            image: new Icon({
              anchor: [0.5, 1],
              src: "https://openlayers.org/en/latest/examples/data/icon.png",
            }),
          })
        );

        const endIcon = new Feature({
          geometry: new Point(line.getLastCoordinate()),
          name: "end",
          finished: false,
        });
        endIcon.setStyle(
          new Style({
            image: new Icon({
              anchor: [0.5, 1],
              src: "https://openlayers.org/en/latest/examples/data/icon.png",
            }),
          })
        );

        features.push(
          startIcon,
          endIcon,
          new Feature({
            geometry: line,
            finished: false,
          })
        );
      });
      // add the features with a delay so that the animation
      // for all features does not start at the same time
      addLater(features, i * 50);
    }
    tileLayer.on("postrender", animateFlights);
  },
});

const flightsLayer = new VectorLayer({
  source: flightsSource,
  style: function (feature) {
    // if the animation is still active for a feature, do not
    // render the feature with the layer style
    if (feature.get("finished")) {
      return style;
    }
    return null;
  },
});

map.addLayer(flightsLayer);

const pointsPerMs = 0.02;
function animateFlights(event) {
  const vectorContext = getVectorContext(event);
  const frameState = event.frameState;
  const resolution = frameState.viewState.resolution;
  vectorContext.setStyle(style);

  const features = flightsSource.getFeatures();
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (!feature.get("finished")) {
      // only draw the lines for which the animation has not finished yet
      const coords = feature.getGeometry().getCoordinates();
      const elapsedTime = frameState.time - feature.get("start");
      if (elapsedTime >= 0) {
        const elapsedPoints = elapsedTime * pointsPerMs;

        if (elapsedPoints >= coords.length) {
          feature.set("finished", true);
        }

        const maxIndex = Math.min(elapsedPoints, coords.length);
        const currentLine = new LineString(coords.slice(0, maxIndex));

        // animation is needed in the current and nearest adjacent wrapped world
        const worldWidth = getWidth(map.getView().getProjection().getExtent());
        const offset = Math.floor(map.getView().getCenter()[0] / worldWidth);

        // add icons to start and end points of arc
        const start = coords[0];
        const end = coords[coords.length - 1];
        const startIconFeature = new Feature({
          geometry: new Point(start),
          finished: false,
        });
        const endIconFeature = new Feature({
          geometry: new Point(end),
          finished: false,
        });
        startIconFeature.setStyle(
          new Style({
            image: new Icon({
              src: "https://openlayers.org/en/latest/examples/data/icon.png",
              scale: 0.05 / resolution,
              rotateWithView: true,
            }),
          })
        );
        endIconFeature.setStyle(
          new Style({
            image: new Icon({
              src: "https://openlayers.org/en/latest/examples/data/icon.png",
              scale: 0.05 / resolution,
              rotateWithView: true,
            }),
          })
        );
        flightsSource.addFeatures([startIconFeature, endIconFeature]);

        // directly draw the lines with the vector context
        currentLine.translate(offset * worldWidth, 0);
        vectorContext.drawGeometry(currentLine);
        currentLine.translate(worldWidth, 0);
        vectorContext.drawGeometry(currentLine);
      }
    }
  }
  // tell OpenLayers to continue the animation
  map.render();
}

function addLater(features, timeout) {
  window.setTimeout(function () {
    let start = Date.now();
    features.forEach(function (feature) {
      feature.set("start", start);
      flightsSource.addFeature(feature);
      const duration =
        (feature.getGeometry().getCoordinates().length - 1) / pointsPerMs;
      start += duration;
    });
  }, timeout);
}
map.on("singleclick", function (evt) {
  const coordinate = evt.coordinate;
  const hdms = toStringHDMS(toLonLat(coordinate));

  content.innerHTML = "<p>You clicked here:</p><code>" + hdms + "</code>";
  overlay.setPosition(coordinate);
});
closer.onclick = function () {
  overlay.setPosition(undefined);
  closer.blur();
  return false;
};
map.on("movestart", () => {
  overlay.setPosition(undefined);
  closer.blur();
  return false;
});
