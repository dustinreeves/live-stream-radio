const test = require('node:test');
const assert = require('node:assert');
const ffmpegOptions = require('../src/stream/ffmpegOptions');

test('video size defaults to landscape 854x480', () => {
  assert.deepStrictEqual(ffmpegOptions.getVideoSize({}), { width: 854, height: 480 });
  assert.deepStrictEqual(ffmpegOptions.getVideoSize({ video_width: '1280', video_height: '720' }), { width: 1280, height: 720 });
});

test('the filter keeps the song at full volume', () => {
  const filter = ffmpegOptions.buildComplexFilter({}, undefined, '');
  assert.match(filter, /amix=inputs=2:duration=first:dropout_transition=3, volume=2 \[audiooutput\]/);
  assert.match(filter, /\[0:v\] fps=fps=24, scale=854:480 \[videooutput\]$/);
});

test('loudnorm is resampled back down', () => {
  const filter = ffmpegOptions.buildComplexFilter({ normalize_audio: 'true', audio_sample_rate: '48000' }, undefined, '');
  assert.match(filter, /volume=2, loudnorm, aresample=48000 \[audiooutput\]/);
  assert.match(ffmpegOptions.buildComplexFilter({ normalize_audio: true }, undefined, ''), /aresample=44100/);
});

test('overlay image and text', () => {
  const filter = ffmpegOptions.buildComplexFilter({ video_width: 1280, video_height: 720 }, { position_x: 1, position_y: 2 }, 'drawtext=x');
  assert.strictEqual(filter.indexOf('scale2ref'), -1);
  assert.ok(
    filter.endsWith(
      '[0:v] fps=fps=24, scale=1280:720 [inputvideo]; [3:v] scale=1280:720 [overlayimage]; ' +
        '[inputvideo][overlayimage] overlay=x=1:y=2, drawtext=x [videooutput]'
    ),
    filter
  );
});

test('stream duration pads both ends', () => {
  assert.strictEqual(ffmpegOptions.getStreamDuration(60.2), 67);
});

test('output options are ffmpeg arguments', () => {
  const options = ffmpegOptions.buildOutputOptions({ video_fps: '25', video_bit_rate: '2500k' }, 67);
  const pairs = {};
  for (let i = 0; i < options.length; i += 2) {
    pairs[options[i]] = options[i + 1];
  }
  assert.deepStrictEqual(
    { r: pairs['-r'], g: pairs['-g'], t: pairs['-t'], bv: pairs['-b:v'], acodec: pairs['-acodec'], vcodec: pairs['-vcodec'] },
    { r: '25', g: '50', t: '67', bv: '2500k', acodec: 'aac', vcodec: 'libx264' }
  );
  options.forEach(option => assert.strictEqual(typeof option, 'string'));
});

test('one output streams flv directly', () => {
  assert.deepStrictEqual(ffmpegOptions.getOutputTarget('rtmp://a/live/key'), { location: 'rtmp://a/live/key', options: ['-f', 'flv'] });
  assert.strictEqual(ffmpegOptions.getOutputTarget(['rtmp://a/live/key']).location, 'rtmp://a/live/key');
});

test('several outputs use the tee muxer', () => {
  const target = ffmpegOptions.getOutputTarget(['rtmp://a/live/1', 'rtmp://b/live/[2]|x']);
  assert.strictEqual(target.location, '[f=flv:onfail=ignore]rtmp://a/live/1|[f=flv:onfail=ignore]rtmp://b/live/\\[2\\]\\|x');
  assert.deepStrictEqual(target.options, ['-flags', '+global_header', '-f', 'tee']);
});

test('no output is an error', () => {
  assert.throws(() => ffmpegOptions.getOutputTarget([]), /no stream output/);
  assert.throws(() => ffmpegOptions.getOutputTarget(undefined), /no stream output/);
});
