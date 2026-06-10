import {
  easeOut,
  linear
} from "./chunk-6NHAKJI5.js";
import {
  MAC,
  WEBKIT
} from "./chunk-JZYPKUF6.js";
import {
  rotate,
  scale
} from "./chunk-F54ISTXV.js";
import {
  Object_default
} from "./chunk-ZPJUDBEV.js";
import {
  EventType_default,
  FALSE,
  TRUE
} from "./chunk-XTCGRPCY.js";

// node_modules/ol/MapBrowserEventType.js
var MapBrowserEventType_default = {
  /**
   * A true single click with no dragging and no double click. Note that this
   * event is delayed by 250 ms to ensure that it is not a double click.
   * @event module:ol/MapBrowserEvent~MapBrowserEvent#singleclick
   * @api
   */
  SINGLECLICK: "singleclick",
  /**
   * A click with no dragging. A double click will fire two of this.
   * @event module:ol/MapBrowserEvent~MapBrowserEvent#click
   * @api
   */
  CLICK: EventType_default.CLICK,
  /**
   * A true double click, with no dragging.
   * @event module:ol/MapBrowserEvent~MapBrowserEvent#dblclick
   * @api
   */
  DBLCLICK: EventType_default.DBLCLICK,
  /**
   * Triggered when a pointer is dragged.
   * @event module:ol/MapBrowserEvent~MapBrowserEvent#pointerdrag
   * @api
   */
  POINTERDRAG: "pointerdrag",
  /**
   * Triggered when a pointer is moved. Note that on touch devices this is
   * triggered when the map is panned, so is not the same as mousemove.
   * @event module:ol/MapBrowserEvent~MapBrowserEvent#pointermove
   * @api
   */
  POINTERMOVE: "pointermove",
  POINTERDOWN: "pointerdown",
  POINTERUP: "pointerup",
  POINTEROVER: "pointerover",
  POINTEROUT: "pointerout",
  POINTERENTER: "pointerenter",
  POINTERLEAVE: "pointerleave",
  POINTERCANCEL: "pointercancel"
};

// node_modules/ol/events/condition.js
function all(var_args) {
  const conditions = arguments;
  return function(event) {
    let pass = true;
    for (let i = 0, ii = conditions.length; i < ii; ++i) {
      pass = pass && conditions[i](event);
      if (!pass) {
        break;
      }
    }
    return pass;
  };
}
var altShiftKeysOnly = function(mapBrowserEvent) {
  const originalEvent = mapBrowserEvent.originalEvent;
  return originalEvent.altKey && !(originalEvent.metaKey || originalEvent.ctrlKey) && originalEvent.shiftKey;
};
var focus = function(event) {
  const targetElement = event.map.getTargetElement();
  const rootNode = targetElement.getRootNode();
  const activeElement = event.map.getOwnerDocument().activeElement;
  return rootNode instanceof ShadowRoot ? rootNode.host.contains(activeElement) : targetElement.contains(activeElement);
};
var focusWithTabindex = function(event) {
  const targetElement = event.map.getTargetElement();
  const rootNode = targetElement.getRootNode();
  const tabIndexCandidate = rootNode instanceof ShadowRoot ? rootNode.host : targetElement;
  return tabIndexCandidate.hasAttribute("tabindex") ? focus(event) : true;
};
var always = TRUE;
var mouseActionButton = function(mapBrowserEvent) {
  const originalEvent = mapBrowserEvent.originalEvent;
  return "pointerId" in originalEvent && originalEvent.button == 0 && !(WEBKIT && MAC && originalEvent.ctrlKey);
};
var noModifierKeys = function(mapBrowserEvent) {
  const originalEvent = (
    /** @type {KeyboardEvent|MouseEvent|TouchEvent} */
    mapBrowserEvent.originalEvent
  );
  return !originalEvent.altKey && !(originalEvent.metaKey || originalEvent.ctrlKey) && !originalEvent.shiftKey;
};
var platformModifierKey = function(mapBrowserEvent) {
  const originalEvent = mapBrowserEvent.originalEvent;
  return MAC ? originalEvent.metaKey : originalEvent.ctrlKey;
};
var shiftKeyOnly = function(mapBrowserEvent) {
  const originalEvent = mapBrowserEvent.originalEvent;
  return !originalEvent.altKey && !(originalEvent.metaKey || originalEvent.ctrlKey) && originalEvent.shiftKey;
};
var targetNotEditable = function(mapBrowserEvent) {
  const originalEvent = mapBrowserEvent.originalEvent;
  const tagName = (
    /** @type {Element} */
    originalEvent.target.tagName
  );
  return tagName !== "INPUT" && tagName !== "SELECT" && tagName !== "TEXTAREA" && // `isContentEditable` is only available on `HTMLElement`, but it may also be a
  // different type like `SVGElement`.
  // @ts-ignore
  !originalEvent.target.isContentEditable;
};
var mouseOnly = function(mapBrowserEvent) {
  const pointerEvent = mapBrowserEvent.originalEvent;
  return "pointerId" in pointerEvent && pointerEvent.pointerType == "mouse";
};
var primaryAction = function(mapBrowserEvent) {
  const pointerEvent = mapBrowserEvent.originalEvent;
  return "pointerId" in pointerEvent && pointerEvent.isPrimary && pointerEvent.button === 0;
};

// node_modules/ol/interaction/Property.js
var Property_default = {
  ACTIVE: "active"
};

// node_modules/ol/interaction/Interaction.js
var Interaction = class extends Object_default {
  /**
   * @param {InteractionOptions} [options] Options.
   */
  constructor(options) {
    super();
    this.on;
    this.once;
    this.un;
    if (options && options.handleEvent) {
      this.handleEvent = options.handleEvent;
    }
    this.map_ = null;
    this.setActive(true);
  }
  /**
   * Return whether the interaction is currently active.
   * @return {boolean} `true` if the interaction is active, `false` otherwise.
   * @observable
   * @api
   */
  getActive() {
    return (
      /** @type {boolean} */
      this.get(Property_default.ACTIVE)
    );
  }
  /**
   * Get the map associated with this interaction.
   * @return {import("../Map.js").default|null} Map.
   * @api
   */
  getMap() {
    return this.map_;
  }
  /**
   * Handles the {@link module:ol/MapBrowserEvent~MapBrowserEvent map browser event}.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Map browser event.
   * @return {boolean} `false` to stop event propagation.
   * @api
   */
  handleEvent(mapBrowserEvent) {
    return true;
  }
  /**
   * Activate or deactivate the interaction.
   * @param {boolean} active Active.
   * @observable
   * @api
   */
  setActive(active) {
    this.set(Property_default.ACTIVE, active);
  }
  /**
   * Remove the interaction from its current map and attach it to the new map.
   * Subclasses may set up event handlers to get notified about changes to
   * the map here.
   * @param {import("../Map.js").default|null} map Map.
   */
  setMap(map) {
    this.map_ = map;
  }
};
function pan(view, delta, duration) {
  const currentCenter = view.getCenterInternal();
  if (currentCenter) {
    const center = [currentCenter[0] + delta[0], currentCenter[1] + delta[1]];
    view.animateInternal({
      duration: duration !== void 0 ? duration : 250,
      easing: linear,
      center: view.getConstrainedCenter(center)
    });
  }
}
function zoomByDelta(view, delta, anchor, duration) {
  const currentZoom = view.getZoom();
  if (currentZoom === void 0) {
    return;
  }
  const newZoom = view.getConstrainedZoom(currentZoom + delta);
  const newResolution = view.getResolutionForZoom(newZoom);
  if (view.getAnimating()) {
    view.cancelAnimations();
  }
  view.animate({
    resolution: newResolution,
    anchor,
    duration: duration !== void 0 ? duration : 250,
    easing: easeOut
  });
}
var Interaction_default = Interaction;

// node_modules/ol/interaction/Pointer.js
var PointerInteraction = class extends Interaction_default {
  /**
   * @param {Options} [options] Options.
   */
  constructor(options) {
    options = options ? options : {};
    super(
      /** @type {import("./Interaction.js").InteractionOptions} */
      options
    );
    if (options.handleDownEvent) {
      this.handleDownEvent = options.handleDownEvent;
    }
    if (options.handleDragEvent) {
      this.handleDragEvent = options.handleDragEvent;
    }
    if (options.handleMoveEvent) {
      this.handleMoveEvent = options.handleMoveEvent;
    }
    if (options.handleUpEvent) {
      this.handleUpEvent = options.handleUpEvent;
    }
    if (options.stopDown) {
      this.stopDown = options.stopDown;
    }
    this.handlingDownUpSequence = false;
    this.targetPointers = [];
  }
  /**
   * Returns the current number of pointers involved in the interaction,
   * e.g. `2` when two fingers are used.
   * @return {number} The number of pointers.
   * @api
   */
  getPointerCount() {
    return this.targetPointers.length;
  }
  /**
   * Handle pointer down events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @return {boolean} If the event was consumed.
   * @protected
   */
  handleDownEvent(mapBrowserEvent) {
    return false;
  }
  /**
   * Handle pointer drag events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @protected
   */
  handleDragEvent(mapBrowserEvent) {
  }
  /**
   * Handles the {@link module:ol/MapBrowserEvent~MapBrowserEvent map browser event} and may call into
   * other functions, if event sequences like e.g. 'drag' or 'down-up' etc. are
   * detected.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Map browser event.
   * @return {boolean} `false` to stop event propagation.
   * @api
   * @override
   */
  handleEvent(mapBrowserEvent) {
    if (!mapBrowserEvent.originalEvent) {
      return true;
    }
    let stopEvent = false;
    this.updateTrackedPointers_(mapBrowserEvent);
    if (this.handlingDownUpSequence) {
      if (mapBrowserEvent.type == MapBrowserEventType_default.POINTERDRAG) {
        this.handleDragEvent(mapBrowserEvent);
        mapBrowserEvent.originalEvent.preventDefault();
      } else if (mapBrowserEvent.type == MapBrowserEventType_default.POINTERUP) {
        const handledUp = this.handleUpEvent(mapBrowserEvent);
        this.handlingDownUpSequence = handledUp && this.targetPointers.length > 0;
      }
    } else {
      if (mapBrowserEvent.type == MapBrowserEventType_default.POINTERDOWN) {
        const handled = this.handleDownEvent(mapBrowserEvent);
        this.handlingDownUpSequence = handled;
        stopEvent = this.stopDown(handled);
      } else if (mapBrowserEvent.type == MapBrowserEventType_default.POINTERMOVE) {
        this.handleMoveEvent(mapBrowserEvent);
      }
    }
    return !stopEvent;
  }
  /**
   * Handle pointer move events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @protected
   */
  handleMoveEvent(mapBrowserEvent) {
  }
  /**
   * Handle pointer up events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @return {boolean} If the event was consumed.
   * @protected
   */
  handleUpEvent(mapBrowserEvent) {
    return false;
  }
  /**
   * This function is used to determine if "down" events should be propagated
   * to other interactions or should be stopped.
   * @param {boolean} handled Was the event handled by the interaction?
   * @return {boolean} Should the `down` event be stopped?
   */
  stopDown(handled) {
    return handled;
  }
  /**
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @private
   */
  updateTrackedPointers_(mapBrowserEvent) {
    if (mapBrowserEvent.activePointers) {
      this.targetPointers = mapBrowserEvent.activePointers;
    }
  }
};
function centroid(pointerEvents) {
  const length = pointerEvents.length;
  let clientX = 0;
  let clientY = 0;
  for (let i = 0; i < length; i++) {
    clientX += pointerEvents[i].clientX;
    clientY += pointerEvents[i].clientY;
  }
  return { clientX: clientX / length, clientY: clientY / length };
}
var Pointer_default = PointerInteraction;

// node_modules/ol/interaction/DragPan.js
var DragPan = class extends Pointer_default {
  /**
   * @param {Options} [options] Options.
   */
  constructor(options) {
    super({
      stopDown: FALSE
    });
    options = options ? options : {};
    this.kinetic_ = options.kinetic;
    this.lastCentroid = null;
    this.lastPointersCount_;
    this.panning_ = false;
    const condition = options.condition ? options.condition : all(noModifierKeys, primaryAction);
    this.condition_ = options.onFocusOnly ? all(focusWithTabindex, condition) : condition;
    this.noKinetic_ = false;
  }
  /**
   * Handle pointer drag events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @override
   */
  handleDragEvent(mapBrowserEvent) {
    const map = mapBrowserEvent.map;
    if (!this.panning_) {
      this.panning_ = true;
      map.getView().beginInteraction();
    }
    const targetPointers = this.targetPointers;
    const centroid2 = map.getEventPixel(centroid(targetPointers));
    if (targetPointers.length == this.lastPointersCount_) {
      if (this.kinetic_) {
        this.kinetic_.update(centroid2[0], centroid2[1]);
      }
      if (this.lastCentroid) {
        const delta = [
          this.lastCentroid[0] - centroid2[0],
          centroid2[1] - this.lastCentroid[1]
        ];
        const map2 = mapBrowserEvent.map;
        const view = map2.getView();
        scale(delta, view.getResolution());
        rotate(delta, view.getRotation());
        view.adjustCenterInternal(delta);
      }
    } else if (this.kinetic_) {
      this.kinetic_.begin();
    }
    this.lastCentroid = centroid2;
    this.lastPointersCount_ = targetPointers.length;
    mapBrowserEvent.originalEvent.preventDefault();
  }
  /**
   * Handle pointer up events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @return {boolean} If the event was consumed.
   * @override
   */
  handleUpEvent(mapBrowserEvent) {
    const map = mapBrowserEvent.map;
    const view = map.getView();
    if (this.targetPointers.length === 0) {
      if (!this.noKinetic_ && this.kinetic_ && this.kinetic_.end()) {
        const distance = this.kinetic_.getDistance();
        const angle = this.kinetic_.getAngle();
        const center = view.getCenterInternal();
        const centerpx = map.getPixelFromCoordinateInternal(center);
        const dest = map.getCoordinateFromPixelInternal([
          centerpx[0] - distance * Math.cos(angle),
          centerpx[1] - distance * Math.sin(angle)
        ]);
        view.animateInternal({
          center: view.getConstrainedCenter(dest),
          duration: 500,
          easing: easeOut
        });
      }
      if (this.panning_) {
        this.panning_ = false;
        view.endInteraction();
      }
      return false;
    }
    if (this.kinetic_) {
      this.kinetic_.begin();
    }
    this.lastCentroid = null;
    return true;
  }
  /**
   * Handle pointer down events.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Event.
   * @return {boolean} If the event was consumed.
   * @override
   */
  handleDownEvent(mapBrowserEvent) {
    if (this.targetPointers.length > 0 && this.condition_(mapBrowserEvent)) {
      const map = mapBrowserEvent.map;
      const view = map.getView();
      this.lastCentroid = null;
      if (view.getAnimating()) {
        view.cancelAnimations();
      }
      if (this.kinetic_) {
        this.kinetic_.begin();
      }
      this.noKinetic_ = this.targetPointers.length > 1;
      return true;
    }
    return false;
  }
};
var DragPan_default = DragPan;

export {
  MapBrowserEventType_default,
  pan,
  zoomByDelta,
  Interaction_default,
  all,
  altShiftKeysOnly,
  focusWithTabindex,
  always,
  mouseActionButton,
  noModifierKeys,
  platformModifierKey,
  shiftKeyOnly,
  targetNotEditable,
  mouseOnly,
  centroid,
  Pointer_default,
  DragPan_default
};
//# sourceMappingURL=chunk-XO4YEICR.js.map
