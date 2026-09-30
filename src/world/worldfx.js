// World shading shared by every material in the main scene:
// - aerial perspective: height haze coloured like the sky in each direction,
//   glowing toward the sun, applied in linear light before tone mapping so
//   far mountains melt into the sky;
// - light under water: absorption along the refracted view ray, scattered
//   water colour, moving caustics and a wet band just above the waterline;
// - mountain shadows and sky occlusion from the lighting maps (lighting.js).
//
// Installed as the default Material.onBeforeCompile. Materials with their own
// onBeforeCompile call fxPatch(shader, material) at the end. Everything is
// wrapped in USE_FOG, so the fog-less first person viewmodel scene is
// untouched.
import * as THREE from 'three';

// Shared uniform objects: every patched program references these same objects,
// so updating a value here updates all materials.
export const FX = {
  uFxSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFxHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uFxGlow: { value: new THREE.Color(0, 0, 0) },
  uFxHazeH: { value: 1 / 150 },
  uFxHazeK: { value: 1 },
  uFxTime: { value: 0 },
  // water: level texture (R level, G lake, B glacial, A ocean weights)
  uFxWater: { value: null },
  uFxWaterMax: { value: -1e4 },
  uFxWorld: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCaustics: { value: null },
  uFxCausticStr: { value: 0 },
  uFxWaterLight: { value: new THREE.Color(1, 1, 1) },
  uFxSigma: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uFxDeep: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  // lighting maps: R sun visibility past mountains, G sky visibility
  uFxShade: { value: null },
  uFxShadeTf: { value: new THREE.Vector3(0, 0, 0) },
  uFxShadeOn: { value: 0 },
  uFxMask: { value: null },
  uFxTranslucent: { value: new THREE.Color(0, 0, 0) },
};

// Per water kind (river, lake, glacial, ocean): extinction per metre in
// linear RGB and the colour of infinitely deep water under white light.
export const WATER_OPTICS = {
  sigma: [
    [0.42, 0.13, 0.12],
    [0.62, 0.3, 0.42],
    [1.25, 0.62, 0.52],
    [0.4, 0.1, 0.085],
  ],
  deep: [
    [0.014, 0.043, 0.04],
    [0.016, 0.034, 0.022],
    [0.05, 0.19, 0.2],
    [0.006, 0.036, 0.05],
  ],
};
WATER_OPTICS.sigma.forEach((s, i) => FX.uFxSigma.value[i].set(s[0], s[1], s[2]));
WATER_OPTICS.deep.forEach((s, i) => FX.uFxDeep.value[i].set(s[0], s[1], s[2]));

const VERT_PARS = /* glsl */ `
#include <fog_pars_vertex>
#ifdef USE_FOG
varying vec3 vFxWorld;
#endif
`;

const VERT_MAIN = /* glsl */ `
#include <fog_vertex>
#ifdef USE_FOG
vFxWorld = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif
`;

// Declarations and helper functions (fragment shader).
export const FX_FRAG_PARS = /* glsl */ `
#include <fog_pars_fragment>
#ifdef USE_FOG
varying vec3 vFxWorld;
uniform vec3 uFxSunDir;
uniform vec3 uFxHorizon;
uniform vec3 uFxGlow;
uniform float uFxHazeH;
uniform float uFxHazeK;
uniform float uFxTime;
uniform sampler2D uFxWater;
uniform float uFxWaterMax;
uniform vec4 uFxWorld;
uniform sampler2D uFxCaustics;
uniform float uFxCausticStr;
uniform vec3 uFxWaterLight;
uniform vec3 uFxSigma[ 4 ];
uniform vec3 uFxDeep[ 4 ];
uniform sampler2D uFxShade;
uniform vec3 uFxShadeTf;
uniform float uFxShadeOn;
uniform sampler2D uFxMask;
uniform vec3 uFxTranslucent;

// Sky colour close to the horizon in direction dir (matches sky.js).
vec3 fxSkyColor( vec3 dir ) {
	float sd = max( dot( dir, uFxSunDir ), 0.0 );
	float hb = 1.0 + 1.5 * ( 1.0 - smoothstep( 0.0, 0.35, abs( dir.y ) ) );
	return uFxHorizon + uFxGlow * ( pow( sd, 5.0 ) * 0.45 + pow( sd, 48.0 ) * 0.8 ) * hb;
}

// Height haze between the camera and wp, thinning with altitude.
float fxHaze( vec3 wp ) {
	vec3 d = wp - cameraPosition;
	float dist = length( d );
	float k = d.y * uFxHazeH;
	float f = abs( k ) > 1e-3 ? ( 1.0 - exp( - k ) ) / k : 1.0 - 0.5 * k;
	float h0 = max( cameraPosition.y, - 20.0 ) * uFxHazeH;
	#ifdef FOG_EXP2
		float od = fogDensity * uFxHazeK * dist * exp( - h0 ) * f;
		return 1.0 - exp( - od * od );
	#else
		return smoothstep( fogNear, fogFar, dist * exp( - h0 ) * f );
	#endif
}

vec3 fxAtmosphere( vec3 col, vec3 wp ) {
	vec3 d = wp - cameraPosition;
	return mix( col, fxSkyColor( normalize( d ) ), fxHaze( wp ) );
}

vec2 fxShade( vec3 wp ) {
	vec2 uv = ( wp.xz - uFxShadeTf.xy ) * uFxShadeTf.z;
	if ( uFxShadeOn < 0.5 || uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) return vec2( 1.0 );
	return texture2D( uFxShade, uv ).rg;
}

vec4 fxWaterAt( vec2 xz ) {
	vec2 uv = ( xz - uFxWorld.xy ) * uFxWorld.z + uFxWorld.w;
	return texture2D( uFxWater, clamp( uv, 0.0, 1.0 ) );
}

vec3 fxWaterSigma( vec4 w ) {
	float river = clamp( 1.0 - w.y - w.z - w.w, 0.0, 1.0 );
	return uFxSigma[ 0 ] * river + uFxSigma[ 1 ] * w.y + uFxSigma[ 2 ] * w.z + uFxSigma[ 3 ] * w.w;
}

vec3 fxWaterDeep( vec4 w ) {
	float river = clamp( 1.0 - w.y - w.z - w.w, 0.0, 1.0 );
	return uFxDeep[ 0 ] * river + uFxDeep[ 1 ] * w.y + uFxDeep[ 2 ] * w.z + uFxDeep[ 3 ] * w.w;
}

// Two drifting copies of the caustic network; their geometric mean makes the
// lines dance. Returns about 0 on average, negative between the lines.
float fxCaustics( vec2 xz ) {
	vec2 uv = xz * 0.21;
	float a = texture2D( uFxCaustics, uv + vec2( uFxTime * 0.021, uFxTime * 0.013 ) ).r;
	float b = texture2D( uFxCaustics, uv * 1.37 + vec2( 0.43 - uFxTime * 0.017, 0.21 + uFxTime * 0.024 ) ).r;
	return ( sqrt( a * b ) * 4.0 - 0.7 ) * 0.45;
}

// Light reaching the eye from a surface under water, given its lit colour.
vec3 fxUnderwater( vec3 col, vec3 wp ) {
	if ( wp.y > uFxWaterMax ) return col;
	vec4 w = fxWaterAt( wp.xz );
	float below = w.x - wp.y;
	if ( below <= 0.0 ) {
		// wet band just above the waterline
		float wet = 1.0 - smoothstep( 0.0, 0.28, - below );
		return col * ( 1.0 - 0.32 * wet );
	}
	vec3 sigma = fxWaterSigma( w );
	vec3 V = wp - cameraPosition;
	float vd = max( length( V ), 1e-3 );
	float cosI = clamp( - V.y / vd, 0.0, 1.0 );
	// Snell: the ray bends toward the vertical under the surface
	float cosT = sqrt( 1.0 - ( 1.0 - cosI * cosI ) * 0.5625 );
	float lv = cameraPosition.y < w.x ? vd : below / cosT;
	float ls = below * 1.2;
	vec3 tv = exp( - sigma * lv );
	vec3 t = tv * exp( - sigma * ls );
	float c = fxCaustics( wp.xz ) * uFxCausticStr * exp( - below * 0.22 ) * smoothstep( 0.0, 0.3, below );
	return col * t * ( 1.0 + c ) + fxWaterDeep( w ) * uFxWaterLight * ( 1.0 - tv );
}
#endif
`;

// Runs in linear light right before tone mapping.
const FRAG_FINAL = /* glsl */ `
#ifdef USE_FOG
	#ifdef FX_UNDERWATER
		gl_FragColor.rgb = fxUnderwater( gl_FragColor.rgb, vFxWorld );
	#endif
	gl_FragColor.rgb = fxAtmosphere( gl_FragColor.rgb, vFxWorld );
#endif
#include <tonemapping_fragment>
`;

// Sun visibility from the mountain shadow map multiplies the sun light, and
// sky visibility darkens ambient light in valleys and under forest.
const LIGHTS_BEGIN = /* glsl */ `
#ifdef USE_FOG
	vec2 fxSh = fxShade( vFxWorld );
	float fxSunVis = fxSh.r;
	float fxSkyVis = fxSh.g;
	#ifdef FX_CANOPY
		float fxForest = texture2D( uFxMask, ( vFxWorld.xz - uFxWorld.xy ) * uFxWorld.z + uFxWorld.w ).a;
		fxSkyVis *= 1.0 - 0.5 * fxForest;
	#endif
#else
	float fxSunVis = 1.0;
	float fxSkyVis = 1.0;
#endif
vec3 fxSunLight = vec3( 0.0 );
${THREE.ShaderChunk.lights_fragment_begin
  .replace(/getDirectionalLightInfo\( directionalLight, directLight \);/, '$&\n\t\tdirectLight.color *= fxSunVis;')
  .replace(/getSunLightInfo\( sunLight, directLight \);/, '$&\n\t\tdirectLight.color *= fxSunVis;')
  .replace(/(for \( int i = 0; i < NUM_DIR_LIGHTS; i \+\+ \) \{[\s\S]*?)(RE_Direct\( directLight)/, '$1fxSunLight += directLight.color;\n\t\t$2')
  .replace(/(for \( int i = 0; i < NUM_SUN_LIGHTS; i \+\+ \) \{[\s\S]*?)(RE_Direct\( directLight)/, '$1fxSunLight += directLight.color;\n\t\t$2')}
`;

const LIGHTS_END = /* glsl */ `
#if defined( RE_IndirectDiffuse )
	float fxAmb = mix( 0.42, 1.0, fxSkyVis );
	irradiance *= fxAmb;
	iblIrradiance *= fxAmb;
#endif
#if defined( RE_IndirectSpecular )
	radiance *= mix( 0.5, 1.0, fxSkyVis );
#endif
#include <lights_fragment_end>
#if defined( FX_FOLIAGE ) && defined( USE_FOG )
	// sunlight glowing through thin leaves when looking toward the sun
	{
		vec3 fxV = normalize( vFxWorld - cameraPosition );
		float fxBack = pow( max( dot( fxV, uFxSunDir ), 0.0 ), 3.0 );
		reflectedLight.directDiffuse += diffuseColor.rgb * fxSunLight * fxBack * 0.22;
	}
#endif
`;

function isLit(material) {
  return material.isMeshLambertMaterial || material.isMeshStandardMaterial || material.isMeshPhongMaterial;
}

// Patch one shader. `material.userData.fx` may hold flags:
//   'manual'  - only declarations (the shader calls the helpers itself)
//   'canopy'  - forest floor darkening (terrain)
//   'foliage' - backlit leaf translucency
//   'dry'     - never under water (skip the absorption pass)
export function fxPatch(shader, material) {
  const flags = (material && material.userData && material.userData.fx) || '';
  let vs = shader.vertexShader;
  let fs = shader.fragmentShader;
  if (!fs.includes('#include <fog_pars_fragment>') || !vs.includes('#include <fog_vertex>')) return;
  vs = vs.replace('#include <fog_pars_vertex>', VERT_PARS).replace('#include <fog_vertex>', VERT_MAIN);
  fs = fs.replace('#include <fog_pars_fragment>', FX_FRAG_PARS);
  const defines = [];
  if (!flags.includes('manual')) {
    if (fs.includes('#include <tonemapping_fragment>')) {
      fs = fs.replace('#include <tonemapping_fragment>', FRAG_FINAL).replace('#include <fog_fragment>', '');
    }
    if (isLit(material) && fs.includes('#include <lights_fragment_begin>')) {
      fs = fs.replace('#include <lights_fragment_begin>', LIGHTS_BEGIN).replace('#include <lights_fragment_end>', LIGHTS_END);
      if (!flags.includes('dry')) defines.push('FX_UNDERWATER');
      if (flags.includes('canopy')) defines.push('FX_CANOPY');
      if (flags.includes('foliage')) defines.push('FX_FOLIAGE');
    } else if (flags.includes('wet')) defines.push('FX_UNDERWATER');
  }
  if (defines.length) fs = defines.map((d) => `#define ${d}\n`).join('') + fs;
  shader.vertexShader = vs;
  shader.fragmentShader = fs;
  Object.assign(shader.uniforms, FX);
}

let installed = false;

// Make fxPatch the default for every material and key programs by the flags.
export function installWorldFx() {
  if (installed) return;
  installed = true;
  const proto = THREE.Material.prototype;
  proto.onBeforeCompile = function (shader) {
    fxPatch(shader, this);
  };
  const baseKey = proto.customProgramCacheKey;
  proto.customProgramCacheKey = function () {
    return baseKey.call(this) + '|fx:' + ((this.userData && this.userData.fx) || '');
  };
}
