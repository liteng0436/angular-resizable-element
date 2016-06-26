import {
  Directive,
  HostListener,
  Renderer,
  ElementRef,
  OnInit,
  AfterViewInit,
  Output,
  Input,
  EventEmitter,
  ContentChildren,
  QueryList
} from '@angular/core';
import {Subject} from 'rxjs/Subject';
import {Observable} from 'rxjs/Observable';
import {merge} from 'rxjs/observable/merge';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/takeUntil';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/pairwise';
import 'rxjs/add/operator/take';

export interface Edges {
  top?: boolean | number;
  bottom?: boolean | number;
  left?: boolean | number;
  right?: boolean | number;
}

export interface BoundingRectangle {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height?: number;
  width?: number;
}

export interface ResizeEvent {
  rectangle: BoundingRectangle;
  edges: Edges;
}

interface Coordinate {
  x: number;
  y: number;
}

const isNumberCloseTo: Function = (value1: number, value2: number, precision: number = 3): boolean => {
  const diff: number = Math.abs(value1 - value2);
  return diff < precision;
};

const getNewBoundingRectangle: Function =
  (startingRect: BoundingRectangle, edges: Edges, mouseX: number, mouseY: number): BoundingRectangle => {

  const newBoundingRect: BoundingRectangle = {
    top: startingRect.top,
    bottom: startingRect.bottom,
    left: startingRect.left,
    right: startingRect.right
  };

  if (edges.top) {
    newBoundingRect.top += mouseY;
  }
  if (edges.bottom) {
    newBoundingRect.bottom += mouseY;
  }
  if (edges.left) {
    newBoundingRect.left += mouseX;
  }
  if (edges.right) {
    newBoundingRect.right += mouseX;
  }
  newBoundingRect.height = newBoundingRect.bottom - newBoundingRect.top;
  newBoundingRect.width = newBoundingRect.right - newBoundingRect.left;

  return newBoundingRect;

};

const getResizeEdges: Function = ({mouseX, mouseY, elm, allowedEdges}): Edges => {
  const elmPosition: ClientRect = elm.nativeElement.getBoundingClientRect();
  const edges: Edges = {};
  if (allowedEdges.left && isNumberCloseTo(mouseX, elmPosition.left)) {
    edges.left = true;
  }
  if (allowedEdges.right && isNumberCloseTo(mouseX, elmPosition.right)) {
    edges.right = true;
  }
  if (allowedEdges.top && isNumberCloseTo(mouseY, elmPosition.top)) {
    edges.top = true;
  }
  if (allowedEdges.bottom && isNumberCloseTo(mouseY, elmPosition.bottom)) {
    edges.bottom = true;
  }
  return edges;
};

const getResizeCursor: Function = (edges: Edges): string => {
  if (edges.left && edges.top) {
    return 'nw-resize';
  } else if (edges.right && edges.top) {
    return 'ne-resize';
  } else if (edges.left && edges.bottom) {
    return 'sw-resize';
  } else if (edges.right && edges.bottom) {
    return 'se-resize';
  } else if (edges.left || edges.right) {
    return 'ew-resize';
  } else if (edges.top || edges.bottom) {
    return 'ns-resize';
  } else {
    return 'auto';
  }
};

const getEdgesDiff: Function = ({edges, initialRectangle, newRectangle}): Edges => {

  const edgesDiff: Edges = {};
  Object.keys(edges).forEach((edge: string) => {
    edgesDiff[edge] = newRectangle[edge] - initialRectangle[edge];
  });
  return edgesDiff;

};

@Directive({
  selector: '[mwl-resize-handle]'
})
export class ResizeHandle {

  @Input() resizeEdges: Edges = {};

  public resizable: Resizable; // set by the parent mwl-resizable directive

  @HostListener('mouseup', ['$event.clientX', '$event.clientY'])
  private onMouseup(mouseX: number, mouseY: number): void {
    this.resizable.mouseup.next({mouseX, mouseY, edges: this.resizeEdges});
  }

  @HostListener('mousedown', ['$event.clientX', '$event.clientY'])
  private onMousedown(mouseX: number, mouseY: number): void {
    this.resizable.mousedown.next({mouseX, mouseY, edges: this.resizeEdges});
  }

  @HostListener('mousemove', ['$event.clientX', '$event.clientY'])
  private onMousemove(mouseX: number, mouseY: number): void {
    this.resizable.mousemove.next({mouseX, mouseY, edges: this.resizeEdges});
  }

}

@Directive({
  selector: '[mwl-resizable]'
})
export class Resizable implements OnInit, AfterViewInit {

  @Input() validateResize: Function;
  @Input() resizeEdges: Edges = {};
  @Input() enableResizeStyling: boolean = false;
  @Input() resizeSnapGrid: Edges = {};
  @Output() onResizeStart: EventEmitter<Object> = new EventEmitter(false);
  @Output() onResize: EventEmitter<Object> = new EventEmitter(false);
  @Output() onResizeEnd: EventEmitter<Object> = new EventEmitter(false);
  @ContentChildren(ResizeHandle) resizeHandles: QueryList<ResizeHandle>;

  public mouseup: Subject<any> = new Subject();
  public mousedown: Subject<any> = new Subject();
  public mousemove: Subject<any> = new Subject();

  constructor(private renderer: Renderer, private elm: ElementRef) {}

  ngOnInit(): void {

    let currentResize: {
      edges: Edges,
      startingRect: BoundingRectangle,
      currentRect: BoundingRectangle,
      originalStyles: {
        position: string,
        left: string,
        top: string,
        width: string,
        height: string,
        'user-drag': string,
        '-webkit-user-drag': string
      }
    };

    const resetElementStyles: Function = (): void => {
      if (this.enableResizeStyling) {
        for (let key in currentResize.originalStyles) {
          const value: string = currentResize.originalStyles[key];
          if (typeof value !== 'undefined') {
            this.renderer.setElementStyle(this.elm.nativeElement, key, currentResize.originalStyles[key]);
          }
        }
      }
    };

    this.mousemove.subscribe(({mouseX, mouseY}) => {

      const resizeEdges: Edges = getResizeEdges({mouseX, mouseY, elm: this.elm, allowedEdges: this.resizeEdges});
      const cursor: string = getResizeCursor(resizeEdges);
      this.renderer.setElementStyle(this.elm.nativeElement, 'cursor', cursor);

    });

    const mousedrag: Observable<any> = this.mousedown.flatMap(startCoords => {

      const getDiff: Function = moveCoords => {
        return {
          mouseX: moveCoords.mouseX - startCoords.mouseX,
          mouseY: moveCoords.mouseY - startCoords.mouseY
        };
      };

      const getSnapGrid: Function = () => {
        const snapGrid: Coordinate = {x: 1, y: 1};

        if (currentResize) {
          if (this.resizeSnapGrid.left && currentResize.edges.left) {
            snapGrid.x = +this.resizeSnapGrid.left;
          } else if (this.resizeSnapGrid.right && currentResize.edges.right) {
            snapGrid.x = +this.resizeSnapGrid.right;
          }

          if (this.resizeSnapGrid.top && currentResize.edges.top) {
            snapGrid.y = +this.resizeSnapGrid.top;
          } else if (this.resizeSnapGrid.bottom && currentResize.edges.bottom) {
            snapGrid.y = +this.resizeSnapGrid.bottom;
          }
        }

        return snapGrid;
      };

      const getGrid: Function = (coords, snapGrid) => {
        return {
          x: Math.ceil(coords.mouseX / snapGrid.x),
          y: Math.ceil(coords.mouseY / snapGrid.y)
        };
      };

      return merge(
        this.mousemove.take(1).map(coords => [, coords]),
        this.mousemove.pairwise()
      ).map(([previousCoords, newCoords]) => {
        return [previousCoords ? getDiff(previousCoords) : previousCoords, getDiff(newCoords)];
      }).filter(([previousCoords, newCoords]) => {

        if (!previousCoords) {
          return true;
        }

        const snapGrid: Coordinate = getSnapGrid();
        const previousGrid: Coordinate = getGrid(previousCoords, snapGrid);
        const newGrid: Coordinate = getGrid(newCoords, snapGrid);

        return (previousGrid.x !== newGrid.x || previousGrid.y !== newGrid.y);

      }).map(([, newCoords]) => {
        const snapGrid: Coordinate = getSnapGrid();
        return {
          mouseX: Math.round(newCoords.mouseX / snapGrid.x) * snapGrid.x,
          mouseY: Math.round(newCoords.mouseY / snapGrid.y) * snapGrid.y
        };
      }).takeUntil(merge(this.mouseup, this.mousedown));

    }).filter(() => !!currentResize);

    mousedrag.map(({mouseX, mouseY}) => {
      return getNewBoundingRectangle(currentResize.startingRect, currentResize.edges, mouseX, mouseY);
    }).filter((newBoundingRect: BoundingRectangle) => {
      return newBoundingRect.height > 0 && newBoundingRect.width > 0;
    }).filter((newBoundingRect: BoundingRectangle) => {
      return this.validateResize ? this.validateResize({
        rectangle: newBoundingRect,
        edges: getEdgesDiff({
          edges: currentResize.edges,
          initialRectangle: currentResize.startingRect,
          newRectangle: newBoundingRect
        })
      }) : true;
    }).subscribe((newBoundingRect: BoundingRectangle) => {

      if (this.enableResizeStyling) {
        this.renderer.setElementStyle(this.elm.nativeElement, 'height', `${newBoundingRect.height}px`);
        this.renderer.setElementStyle(this.elm.nativeElement, 'width', `${newBoundingRect.width}px`);
        this.renderer.setElementStyle(this.elm.nativeElement, 'top', `${newBoundingRect.top}px`);
        this.renderer.setElementStyle(this.elm.nativeElement, 'left', `${newBoundingRect.left}px`);
      }

      this.onResize.emit({
        edges: getEdgesDiff({
          edges: currentResize.edges,
          initialRectangle: currentResize.startingRect,
          newRectangle: newBoundingRect
        }),
        rectangle: newBoundingRect
      });

      currentResize.currentRect = newBoundingRect;

    });

    this.mousedown.map(({mouseX, mouseY, edges}) => {
      return edges || getResizeEdges({mouseX, mouseY, elm: this.elm, allowedEdges: this.resizeEdges});
    }).filter((edges: Edges) => {
      return Object.keys(edges).length > 0;
    }).subscribe((edges: Edges) => {
      if (currentResize) {
        resetElementStyles();
      }
      const startingRect: BoundingRectangle = this.elm.nativeElement.getBoundingClientRect();
      currentResize = {
        edges,
        startingRect,
        currentRect: startingRect,
        originalStyles: {
          position: this.elm.nativeElement.style.position,
          left: this.elm.nativeElement.style.left,
          top: this.elm.nativeElement.style.top,
          width: `${startingRect.width}px`,
          height: `${startingRect.height}px`,
          'user-drag': this.elm.nativeElement.style['user-drag'],
          '-webkit-user-drag': this.elm.nativeElement.style['-webkit-user-drag']
        }
      };
      if (this.enableResizeStyling) {
        this.renderer.setElementStyle(this.elm.nativeElement, 'position', 'fixed');
        this.renderer.setElementStyle(this.elm.nativeElement, 'left', `${currentResize.startingRect.left}px`);
        this.renderer.setElementStyle(this.elm.nativeElement, 'top', `${currentResize.startingRect.top}px`);
        this.renderer.setElementStyle(this.elm.nativeElement, 'user-drag', 'none');
        this.renderer.setElementStyle(this.elm.nativeElement, '-webkit-user-drag', 'none');
      }
      this.onResizeStart.emit({
        edges: getEdgesDiff({edges, initialRectangle: startingRect, newRectangle: startingRect}),
        rectangle: getNewBoundingRectangle(startingRect, {}, 0, 0)
      });
    });

    this.mouseup.subscribe(() => {
      if (currentResize) {
        this.onResizeEnd.emit({
          edges: getEdgesDiff({
            edges: currentResize.edges,
            initialRectangle: currentResize.startingRect,
            newRectangle: currentResize.currentRect
          }),
          rectangle: currentResize.currentRect
        });
        resetElementStyles();
        currentResize = null;
      }
    });

  }

  ngAfterViewInit(): void {
    this.resizeHandles.forEach((handle: ResizeHandle) => {
      handle.resizable = this;
    });
  }

  @HostListener('document:mouseup', ['$event.clientX', '$event.clientY'])
  private onMouseup(mouseX: number, mouseY: number): void {
    this.mouseup.next({mouseX, mouseY});
  }

  @HostListener('document:mousedown', ['$event.clientX', '$event.clientY'])
  private onMousedown(mouseX: number, mouseY: number): void {
    this.mousedown.next({mouseX, mouseY});
  }

  @HostListener('document:mousemove', ['$event.clientX', '$event.clientY'])
  private onMousemove(mouseX: number, mouseY: number): void {
    this.mousemove.next({mouseX, mouseY});
  }

}
