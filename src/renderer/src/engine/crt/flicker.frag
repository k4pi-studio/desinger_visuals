// CRT Flicker: cała klatka mnożona przez jasność z FlickerModel (model.ts).

uniform float gain;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * gain, inputColor.a);
}
