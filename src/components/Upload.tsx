import { useRef, useState } from 'react';
import { useStore } from '../store/useStore';

export function Upload() {
  const setImage = useStore((s) => s.setImage);
  const imageDataUrl = useStore((s) => s.imageDataUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={`upload${drag ? ' drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <span className="up-emoji">{imageDataUrl ? '🔄' : '🖼️'}</span>
      <span>{imageDataUrl ? '点击或拖拽更换图片' : '点击选择图片，或拖到这里～'}</span>
    </div>
  );
}
