// Simple Spatial Index for LoRaHiveSim
// Provides fast viewport culling and collision detection

class SpatialIndex {
  constructor() {
    this.objects = [];
    this.dirty = true;
  }

  // Add an object with bounding box
  add(obj) {
    if (!obj.bbox) {
      obj.bbox = this.calculateBbox(obj);
    }
    this.objects.push(obj);
    this.dirty = true;
  }

  // Remove an object
  remove(obj) {
    const index = this.objects.indexOf(obj);
    if (index >= 0) {
      this.objects.splice(index, 1);
      this.dirty = true;
    }
  }

  // Clear all objects
  clear() {
    this.objects = [];
    this.dirty = true;
  }

  // Calculate bounding box for different object types
  calculateBbox(obj) {
    if (obj.type === 'polygon') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of obj.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    } else if (obj.radius !== undefined) {
      // Circular obstacle
      return {
        minX: obj.x - obj.radius,
        minY: obj.y - obj.radius,
        maxX: obj.x + obj.radius,
        maxY: obj.y + obj.radius
      };
    } else {
      // Point object (hive, server)
      const padding = 20; // Visual padding
      return {
        minX: obj.x - padding,
        minY: obj.y - padding,
        maxX: obj.x + padding,
        maxY: obj.y + padding
      };
    }
  }

  // Query objects intersecting with viewport
  query(viewport) {
    const { minX, minY, maxX, maxY } = viewport;
    return this.objects.filter(obj => 
      this.intersects(obj.bbox, { minX, minY, maxX, maxY })
    );
  }

  // Check if two bounding boxes intersect
  intersects(a, b) {
    return !(a.maxX < b.minX || b.maxX < a.minX || 
             a.maxY < b.minY || b.maxY < a.minY);
  }

  // Get all objects (fallback)
  getAll() {
    return this.objects;
  }

  // Update bounding box for an object
  updateBbox(obj) {
    obj.bbox = this.calculateBbox(obj);
    this.dirty = true;
  }

  // Get statistics
  getStats() {
    return {
      count: this.objects.length,
      dirty: this.dirty
    };
  }
}

// Export for use in main thread
if (typeof window !== 'undefined') {
  window.SpatialIndex = SpatialIndex;
}