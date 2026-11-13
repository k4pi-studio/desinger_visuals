// CRT Guns: tor sygnału trzech dział elektronowych.
// Dla każdego kanału: zbieżność (przesunięcie ∝ r²), pasmo wzmacniacza
// (rozmycie i dzwonienie w poziomie) i prąd wiązki I = (gain · sygnał)^2.4.

uniform vec3 gain;
uniform vec3 convergence;
uniform vec3 overdrive;
uniform float echoGain;
uniform vec3 echoDelay;
uniform float spreadShift;
uniform float humAmp;
uniform float humBar;
uniform float humPhase;

const float M_RB = 0.012;
const float M_G = 0.006;
const float RING = 0.6;

float softclip(float x) {
  return x < 1.0 ? x : 1.0 + (1.0 - exp(-(x - 1.0))) * 0.25;
}

float tap(vec2 p, vec3 mask) {
  return dot(texture2D(inputBuffer, p).rgb, mask);
}

float gun(vec2 p, vec3 mask, float drive, float od, float delay) {
  float dx = texelSize.x * (1.0 + 3.0 * od);
  float center = tap(p, mask);
  float blur = 0.1 * tap(p - vec2(2.0 * dx, 0.0), mask) + 0.2 * tap(p - vec2(dx, 0.0), mask) +
    0.4 * center + 0.2 * tap(p + vec2(dx, 0.0), mask) + 0.1 * tap(p + vec2(2.0 * dx, 0.0), mask);
  float s = mix(center, blur, od);
  // Dzwonienie: echo krawędzi za przejściem jasności.
  s += RING * od * (s - tap(p - vec2(3.0 * dx, 0.0), mask));
  // Odbicia sygnału: ten sam obraz przychodzi później, czyli przesunięty w prawo.
  if (echoGain > 0.0) {
    s += echoGain * tap(p - vec2(delay, 0.0), mask) + 0.5 * echoGain * tap(p - vec2(2.0 * delay, 0.0), mask);
    s /= 1.0 + 0.75 * echoGain;
  }
  float v = pow(max(s, 0.0), 1.0 / 2.2);
  return softclip(pow(drive * v, 2.4));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 q = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
  float r2 = dot(q, q);
  // Przydźwięk: linie falują w poziomie, a ciemny pas przewija się w pionie.
  vec2 p = uv;
  p.x += humAmp * sin(6.2831853 * (uv.y * 3.0 + humPhase * 5.0));
  float band = fract(uv.y - humPhase) - 0.5;
  float hum = 1.0 - humBar * exp(-band * band / 0.018);
  float r = gun(p + vec2(M_RB * convergence.r * r2 + spreadShift, 0.0), vec3(1.0, 0.0, 0.0), gain.r, overdrive.r, echoDelay.r);
  float g = gun(p + vec2(0.0, M_G * convergence.g * r2), vec3(0.0, 1.0, 0.0), gain.g, overdrive.g, echoDelay.g);
  float b = gun(p - vec2(M_RB * convergence.b * r2 + spreadShift, 0.0), vec3(0.0, 0.0, 1.0), gain.b, overdrive.b, echoDelay.b);
  outputColor = vec4(vec3(r, g, b) * hum, inputColor.a);
}
