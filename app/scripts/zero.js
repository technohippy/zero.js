/*global CanvasMatrix4 */
"use strict";

var ZERO = {};

ZERO.Scene = function() {
  this.lights = [];
  this.meshes = [];
};

ZERO.Scene.prototype.add = function(obj) {
  if (obj.type === "light") {
    this.lights.push(obj);
  }
  else if (obj.type === "mesh") {
    this.meshes.push(obj);
  }
};

ZERO.PerspectiveCamera = function(fov, aspect, near, far) {
  this.fov = fov;
  this.aspect = aspect;
  this.near = near;
  this.far = far;
  this.position = new ZERO.Position();
  this.angle = 0;
};

ZERO.PerspectiveCamera.prototype.rotateOnZAxis = function(angle) {
  this.angle = angle;
};
ZERO.PerspectiveCamera.prototype.rotate = ZERO.PerspectiveCamera.prototype.rotateOnZAxis;

ZERO.PerspectiveCamera.prototype.setPerspective = function(matrix) {
  if (!matrix) matrix = new CanvasMatrix4();
  matrix.rotate(this.angle, 0, 0, 1);
  matrix.translate(this.position.x, this.position.y, this.position.z);
  matrix.perspective(this.fov, this.aspect, this.near, this.far);
  return matrix;
};

ZERO.WebGLRenderer = function() {
  this.domElement = null;
  this.gl = null;
  this.program = null;
  this.ibuffer = null;
  this.vbuffers = null;
  this.numIndices = 0;
  this.uniformVars = null;
};

ZERO.WebGLRenderer.VSHADER_SOURCE =
  "#ifdef GL_ES\n" +
  "precision highp float;\n" +
  "#endif\n" +
  "\n" +
  "uniform mat4 mvpMatrix;\n" +
  "uniform mat4 normalMatrix;\n" +
  "uniform vec4 lightVec;\n" +
  "uniform vec4 lightColor;\n" +
  "uniform vec4 materialColor;\n" +
  "\n" +
  "attribute vec3 position;\n" +
  "attribute vec3 normal;\n" +
  "attribute vec2 uv;\n" +
  "\n" +
  "varying vec4 color;\n" +
  "varying vec2 texCoord;\n" +
  "\n" +
  "void main() {\n" +
  "  vec3  n     = (normalMatrix * vec4(normal, 0.0)).xyz;\n" +
  "  float light = clamp(dot(n, lightVec.xyz), 0.0, 1.0) * 0.8 + 0.2;\n" +
  "  color       = min(min(materialColor, lightColor), vec4(light, light, light, 1.0));\n" +
  "  texCoord    = uv;\n" +
  "  gl_Position = mvpMatrix * vec4(position, 1.0);\n" +
  "}";

ZERO.WebGLRenderer.FSHADER_SOURCE =
  "#ifdef GL_ES\n" +
  "precision highp float;\n" +
  "#endif\n" +
  "\n" +
  "uniform sampler2D texture;\n" +
  "\n" +
  "varying vec4 color;\n" +
  "varying vec2 texCoord;\n" +
  "\n" +
  "void main() {\n" +
  "  //gl_FragColor = texture2D(texture, texCoord) * color;\n" +
  "  gl_FragColor = color;\n" +
  "}";

ZERO.WebGLRenderer.prototype.setSize = function(width, height) {
  this.domElement = document.createElement("canvas");
  this.domElement.width = width;
  this.domElement.height = height;
  this.gl = this.domElement.getContext("webgl") ||
    this.domElement.getContext("experimental-webgl");
  if (!this.gl) throw "WebGL is not supported.";
};

ZERO.WebGLRenderer.prototype.render = function(scene, camera) {
  var i;
  for (i = 0; i < scene.meshes.length; i++) {
    var geometry = scene.meshes[i].geometry;
    geometry.build(camera.position.z / 500.0);
    this._initVertices(geometry);
    this._initIndices(geometry);
    this._initTexture();
    this._initShaders();
  }

  this.gl.clearColor(0, 0, 0, 1);
  this.gl.clearDepth(camera.far);
  this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

  this.gl.enable(this.gl.DEPTH_TEST);
  this.gl.useProgram(this.program);

  var lightVec  = [0.0, 0.0, 0.0, 0.0];
  var lightColor = ZERO.Utils.getRGB(0);
  if (scene.lights && 0 < scene.lights.length) {
    var light = scene.lights[0];
    lightVec = [light.position.x, light.position.y, -light.position.z, 0.0];
    lightColor = light.getColor();
  }

  var modelMatrix = new CanvasMatrix4();

  var mvpMatrix = new CanvasMatrix4(modelMatrix);
  camera.setPerspective(mvpMatrix);

  var normalMatrix = new CanvasMatrix4(modelMatrix);
  normalMatrix.invert();
  normalMatrix.transpose();

  var materialColor = scene.meshes[0].material.getColor();

  var values = [mvpMatrix, normalMatrix, lightVec, lightColor, materialColor];
  for (i = 0; i < values.length; i++) {
    var value = values[i];
    if (value instanceof CanvasMatrix4) {
      this.gl.uniformMatrix4fv(this.uniformVars[i], false, value.getAsWebGLFloatArray());
    }
    else {
      this.gl.uniform4fv(this.uniformVars[i], new Float32Array(value));
    }
  }

  var strides = [3, 3, 2];
  for (i = 0; i < strides.length; i++) {
    var stride = strides[i];
    this.gl.enableVertexAttribArray(i);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbuffers[i]);
    this.gl.vertexAttribPointer(i, stride, this.gl.FLOAT, false, 0, 0);
  }

  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibuffer);

  /*
  this.gl.enable(this.gl.TEXTURE_2D);
  this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  */

  this.gl.drawElements(this.gl.TRIANGLES, this.numIndices, this.gl.UNSIGNED_SHORT, 0);
  this.gl.flush();
};

ZERO.WebGLRenderer.prototype._initVertices = function(mesh) {
  this.vbuffers = [mesh.positions, mesh.positions, mesh.uvs];
  for (var i = 0; i < this.vbuffers.length; i++) {
    var data = this.vbuffers[i];
    var vbuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vbuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
    this.vbuffers[i] = vbuffer;
  }
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
};

ZERO.WebGLRenderer.prototype._initIndices = function(mesh) {
  this.ibuffer = this.gl.createBuffer();
  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibuffer);
  this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Int16Array(mesh.indices), this.gl.STATIC_DRAW);
  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

  this.numIndices = mesh.indices.length;
};

ZERO.WebGLRenderer.prototype._initTexture = function() {
  // TODO
};

ZERO.WebGLRenderer.prototype._initShaders = function() {
  var vshader = this.gl.createShader(this.gl.VERTEX_SHADER);
  this.gl.shaderSource(vshader, ZERO.WebGLRenderer.VSHADER_SOURCE);
  this.gl.compileShader(vshader);
  if (!this.gl.getShaderParameter(vshader, this.gl.COMPILE_STATUS)) {
    throw this.gl.getShaderInfoLog(vshader);
  }

  var fshader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
  this.gl.shaderSource(fshader, ZERO.WebGLRenderer.FSHADER_SOURCE);
  this.gl.compileShader(fshader);
  if (!this.gl.getShaderParameter(fshader, this.gl.COMPILE_STATUS)) {
    throw this.gl.getShaderInfoLog(fshader);
  }

  this.program = this.gl.createProgram();
  this.gl.attachShader(this.program, vshader);
  this.gl.attachShader(this.program, fshader);

  this.gl.bindAttribLocation(this.program, 0, "position");
  this.gl.bindAttribLocation(this.program, 1, "normal");
  this.gl.bindAttribLocation(this.program, 2, "uv");

  this.gl.linkProgram(this.program);
  if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
    throw this.gl.getProgramInfoLog(this.program);
  }

  this.uniformVars =[
    this.gl.getUniformLocation(this.program, "mvpMatrix"),
    this.gl.getUniformLocation(this.program, "normalMatrix"),
    this.gl.getUniformLocation(this.program, "lightVec"),
    this.gl.getUniformLocation(this.program, "lightColor"),
    this.gl.getUniformLocation(this.program, "materialColor")
  ];
};

ZERO.DirectionalLight = function(color) {
  this.type = "light";
  this.color = color;
  this.position = new ZERO.Position();
};

ZERO.DirectionalLight.prototype.getColor = function() {
  return ZERO.Utils.getRGB(this.color);
};

ZERO.PointGeometry = function() {
  this.positions = null;
  this.uvs = null;
  this.indices = null;
};

ZERO.PointGeometry.prototype.build = function(scale) {
  var i, j;
  scale = Math.abs(scale);
  this.positions = [];
  this.uvs = [];
  this.indices = [];
  for (i = 0 ; i <= 8 ; ++i) {
    var v = i / 8.0;
    var y = Math.cos(Math.PI * v) * scale;
    var r = Math.sin(Math.PI * v) * scale;
    for (j = 0 ; j <= 16 ; ++j) {
      var u = j / 16.0;
      this.positions = this.positions.concat(
        Math.cos(2 * Math.PI * u) * r, y, Math.sin(2 * Math.PI * u) * r);
      this.uvs = this.uvs.concat(u, v);
    }
  }

  for (j = 0; j < 8; ++j) {
    var base = j * 17;
    for (i = 0; i < 16; ++i) {
      this.indices = this.indices.concat(
        base + i,      base + i + 1, base + i     + 17,
        base + i + 17, base + i + 1, base + i + 1 + 17);
    }
  }
};

ZERO.MeshBasicMaterial = function(props) {
  this.props = props || {};
};

ZERO.MeshBasicMaterial.prototype.getColor = function() {
  return ZERO.Utils.getRGB(this.props.color || 0xffffff);
};

ZERO.Mesh = function(geometry, material) {
  this.type = "mesh";
  this.geometry = geometry;
  this.material = material;
};

ZERO.Position = function(z) {
  this.x = 0.0;
  this.y = 0.0;
  this.set(z);
};

ZERO.Position.prototype.set = function(z) {
  this.z = -Math.abs(z || 0.0);
};

ZERO.Utils = {
  getRGB: function(color) {
    var r = (color >> 16) / 0xff;
    var g = ((color & 0x00ff00) >> 8) / 0xff;
    var b = (color & 0x0000ff) / 0xff;
    return [r, g, b, 1.0];
  }
};
