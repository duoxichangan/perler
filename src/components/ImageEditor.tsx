import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, {
  type Crop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { CropRatio } from '../types';
import { useStore } from '../store/useStore';

const RATIOS: { label: string; value: CropRatio }[] = [
  { label: '自由', value: 'free' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '2:3', value: '2:3' },
  { label: '3:2', value: '3:2' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];

function ratioValue(r: CropRatio): number | undefined {
  if (r === 'free') return undefined;
  const [a, b] = r.split(':').map(Number);
  return a / b;
}

function makeInitialCrop(W: number, H: number, ar: number): Crop {
  return centerCrop(
    makeAspectCrop({ x: 0, y: 0, width: 100, height: 100, unit: '%' }, ar, W, H),
    W,
    H,
  );
}

export function ImageEditor() {
  const imageDataUrl = useStore((s) => s.imageDataUrl);
  const cropRatio = useStore((s) => s.cropRatio);
  const setCrop = useStore((s) => s.setCrop);
  const setCropRatio = useStore((s) => s.setCropRatio);

  const imgRef = useRef<HTMLImageElement>(null);
  const [rcCrop, setRcCrop] = useState<Crop>();
  const [iw, setIw] = useState(0);
  const [ih, setIh] = useState(0);
  const [imgKey, setImgKey] = useState(0);

  useEffect(() => {
    setRcCrop(undefined);
    setIw(0);
    setIh(0);
    setImgKey((k) => k + 1);
  }, [imageDataUrl]);

  const onImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      if (!W || !H) return;
      setIw(W);
      setIh(H);
      const ar = ratioValue(cropRatio) ?? W / H;
      const c = makeInitialCrop(W, H, ar);
      setRcCrop(c);
      setCrop({
        x: (c.x / 100) * W,
        y: (c.y / 100) * H,
        width: (c.width / 100) * W,
        height: (c.height / 100) * H,
      });
    },
    [cropRatio, setCrop],
  );

  const onCropChange = useCallback(
    (_px: Crop, pct: Crop) => {
      setRcCrop(pct);
      if (iw && ih) {
        setCrop({
          x: (pct.x / 100) * iw,
          y: (pct.y / 100) * ih,
          width: (pct.width / 100) * iw,
          height: (pct.height / 100) * ih,
        });
      }
    },
    [iw, ih, setCrop],
  );

  const onChangeRatio = useCallback(
    (r: CropRatio) => {
      setCropRatio(r);
      if (!iw || !ih) return;
      const ar = ratioValue(r) ?? iw / ih;
      const c = makeInitialCrop(iw, ih, ar);
      setRcCrop(c);
      setCrop({
        x: (c.x / 100) * iw,
        y: (c.y / 100) * ih,
        width: (c.width / 100) * iw,
        height: (c.height / 100) * ih,
      });
    },
    [iw, ih, setCrop, setCropRatio],
  );

  const resetCrop = useCallback(() => {
    if (!iw || !ih) return;
    setRcCrop({ x: 0, y: 0, width: 100, height: 100, unit: '%' });
    setCrop({ x: 0, y: 0, width: iw, height: ih });
  }, [iw, ih, setCrop]);

  if (!imageDataUrl) {
    return <div className="editor-empty">先上传一张图片</div>;
  }

  return (
    <div className="image-editor">
      <div className="toolbar">
        <div className="tool-group ratios">
          {RATIOS.map((r) => (
            <button
              key={r.value}
              className={cropRatio === r.value ? 'active' : ''}
              onClick={() => onChangeRatio(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="tool-group">
          <button onClick={resetCrop}>重置</button>
        </div>
      </div>

      <div style={{ maxWidth: 520 }}>
        <ReactCrop
          crop={rcCrop}
          onChange={onCropChange}
          aspect={ratioValue(cropRatio)}
          minWidth={5}
          minHeight={5}
          keepSelection
          ruleOfThirds
        >
          <img
            key={imgKey}
            ref={imgRef}
            src={imageDataUrl}
            style={{ display: 'block', width: '100%' }}
            alt=""
            onLoad={onImgLoad}
          />
        </ReactCrop>
      </div>

      <p className="hint">拖拽边角调整裁剪框，选择固定比例后自动约束宽高。</p>
    </div>
  );
}
