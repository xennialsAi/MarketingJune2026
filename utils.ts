/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// @ts-ignore
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export const getRandomStyle = (): string => {
  const styles = [
    "formed by fluffy white clouds in a deep blue summer sky",
    "written in glowing constellations against a dark nebula galaxy",
    "arranged using colorful autumn leaves on wet green grass",
    "reflected in cyberpunk neon puddles on a rainy street",
    "drawn with latte art foam in a ceramic coffee cup",
    "glowing as ancient magical runes carved into a dark cave wall",
    "displayed on a futuristic translucent holographic interface",
    "sculpted from melting surrealist gold in a desert landscape",
    "arranged with intricate mechanical gears and steampunk machinery",
    "formed by bioluminescent jellyfish in the deep ocean",
    "composed of vibrant colorful smoke swirling in a dark room",
    "carved into the bark of an ancient mossy oak tree",
    "made of sparkling diamonds scattered on black velvet"
  ];
  return styles[Math.floor(Math.random() * styles.length)];
};

export const cleanBase64 = (data: string): string => {
  // Remove data URL prefix if present to get raw base64
  // Handles generic data:application/octet-stream;base64, patterns too
  return data.replace(/^data:.*,/, '');
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export interface WatermarkOptions {
  type: 'none' | 'text' | 'image';
  text?: string;
  image?: string;
}

const drawWatermark = async (ctx: CanvasRenderingContext2D, width: number, height: number, watermark?: WatermarkOptions) => {
  if (!watermark || watermark.type === 'none') return;
  
  if (watermark.type === 'text' && watermark.text) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.fillText(watermark.text, width - 20, height - 20);
    
    ctx.shadowColor = 'transparent';
  } else if (watermark.type === 'image' && watermark.image) {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Logo size 100x100 max
        const scale = Math.min(100 / img.width, 100 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        
        ctx.globalAlpha = 0.8;
        ctx.drawImage(img, width - w - 20, height - h - 20, w, h);
        ctx.globalAlpha = 1.0;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = watermark.image;
    });
  }
};

export const stitchVideos = (videoUrls: string[]): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    if (!videoUrls || videoUrls.length === 0) return reject("No videos to stitch");
    if (videoUrls.length === 1) return resolve(videoUrls[0]);
    
    const video = document.createElement('video');
    video.crossOrigin = "Anonymous";
    video.playsInline = true;
    video.muted = true;
    
    const canvas = document.createElement('canvas');
    video.src = videoUrls[0];
    await new Promise(r => { video.onloadedmetadata = r; video.load(); });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Check if captureStream is supported
    if (!('captureStream' in HTMLCanvasElement.prototype)) {
      console.warn("Canvas captureStream not supported, returning only the first video");
      return resolve(videoUrls[0]);
    }
    
    const stream = (canvas as any).captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(URL.createObjectURL(blob));
    };
    
    mediaRecorder.start();
    
    let playbackFinished = false;
    
    const drawFrame = () => {
      if (playbackFinished) return;
      if (ctx && video.readyState >= 2) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(drawFrame);
    };
    drawFrame();
    
    for (let i = 0; i < videoUrls.length; i++) {
        video.src = videoUrls[i];
        if (i > 0) await new Promise(r => { video.onloadedmetadata = r; video.load(); });
        await video.play();
        await new Promise(r => video.onended = r);
    }
    
    playbackFinished = true;
    mediaRecorder.stop();
  });
};

export const removeBackgroundBasic = (base64: string, threshold: number = 240): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64);
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        if (diff < threshold) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

export const createGifFromVideo = async (videoUrl: string, watermark?: WatermarkOptions): Promise<Blob> => {
  // Runtime check just in case, though standard imports should throw earlier if failed
  if (typeof GIFEncoder !== 'function') {
    throw new Error("GIF library failed to load correctly. Please refresh the page.");
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = "anonymous";
    video.src = videoUrl;
    video.muted = true;
    
    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 5; 
        const width = 400; // Downscale for speed
        // Ensure even dimensions
        let height = Math.floor((video.videoHeight / video.videoWidth) * width);
        if (height % 2 !== 0) height -= 1;

        const fps = 10;
        const totalFrames = Math.floor(duration * fps);
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) throw new Error("Could not get canvas context");

        // Initialize encoder
        const gif = GIFEncoder();
        
        for (let i = 0; i < totalFrames; i++) {
          // Yield to main thread to prevent UI freeze
          await new Promise(r => setTimeout(r, 0));

          const time = i / fps;
          video.currentTime = time;
          
          // Wait for seek with timeout
          await new Promise<void>((r, rej) => {
             const timeout = setTimeout(() => {
                video.removeEventListener('seeked', seekHandler);
                // Proceed anyway if seek takes too long, though frame might be dupe
                r();
             }, 1000);

             const seekHandler = () => {
               clearTimeout(timeout);
               video.removeEventListener('seeked', seekHandler);
               r();
             };
             video.addEventListener('seeked', seekHandler);
          });
          
          ctx.drawImage(video, 0, 0, width, height);
          await drawWatermark(ctx, width, height, watermark);
          const imageData = ctx.getImageData(0, 0, width, height);
          const { data } = imageData;
          
          // Quantize
          const palette = quantize(data, 256);
          const index = applyPalette(data, palette);
          
          gif.writeFrame(index, width, height, { palette, delay: 1000 / fps });
        }
        
        gif.finish();
        const buffer = gif.bytes();
        resolve(new Blob([buffer], { type: 'image/gif' }));
      } catch (e) {
        console.error("GIF Generation Error:", e);
        reject(e);
      }
    };
    
    video.onerror = (e) => reject(new Error("Video load failed"));
    video.load(); 
  });
};

export const createWebMFromVideo = async (videoUrl: string, watermark?: WatermarkOptions): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = "Anonymous";
    video.playsInline = true;
    video.muted = true;
    
    video.onloadeddata = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;
        
        const stream = canvas.captureStream(30);
        const type = 'video/webm;codecs=vp9';
        const options = MediaRecorder.isTypeSupported(type) ? { mimeType: type } : { mimeType: 'video/webm' };
        
        const recorder = new MediaRecorder(stream, options);
        const chunks: Blob[] = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };
        
        recorder.start();
        
        let playbackFinished = false;
        video.onended = () => {
          playbackFinished = true;
          recorder.stop();
        };
        
        await video.play();
        
        const drawFrame = async () => {
          if (playbackFinished) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          await drawWatermark(ctx, canvas.width, canvas.height, watermark);
          requestAnimationFrame(drawFrame);
        };
        drawFrame();
        
      } catch (e) {
        reject(e);
      }
    };
    
    video.onerror = (e) => reject(new Error("Video load failed"));
    video.load();
  });
};

export const TYPOGRAPHY_SUGGESTIONS = [
  { id: 'cinematic-3d', label: 'Cinematic 3D', prompt: 'Bold, dimensional 3D text with realistic lighting and shadows' },
  { id: 'neon-cyber', label: 'Neon Cyber', prompt: 'Glowing neon tube typography, cyberpunk aesthetic, vibrant bloom' },
  { id: 'elegant-serif', label: 'Elegant Serif', prompt: 'Refined, high-contrast serif typography, luxury editorial look' },
  { id: 'bold-sans', label: 'Bold Sans', prompt: 'Massive, heavy sans-serif typography, geometric and impactful' },
  { id: 'product-commercial', label: 'Product Promo', prompt: 'Sleek, high-end commercial style, clean bold typography with dynamic lighting, designed to showcase a brand or product.' },
  { id: 'sentimental-ad', label: 'Sentimental Story', prompt: 'Soft, warm, emotive lighting, elegant serif typography, evoking feelings of nostalgia, love, and connection for an emotional advertisement.' },
  { id: 'handwritten', label: 'Handwritten', prompt: 'Organic, flowing handwritten brush script, artistic and personal' },
  { id: 'retro-80s', label: 'Retro 80s', prompt: 'Chrome-plated, synthwave style typography with horizon lines and sparkles' },
  { id: 'liquid-metal', label: 'Liquid Metal', prompt: 'Fluid, melting chrome typography, surreal and reflective' },
  { id: 'botanical', label: 'Botanical', prompt: 'Typography intertwined with vines, flowers, and organic nature elements' },
];

export const MOTION_TEMPLATES = [
  { id: 'cinematic-reveal', label: 'Cinematic Reveal', prompt: 'Forms and materializes from darkness.' },
  { id: 'bouncing-pop', label: 'Bouncing Pop', prompt: 'Playful bouncy pop-in animation, energetic scale-up with elastic overshoot.' },
  { id: 'glitch-effect', label: 'Glitch Effect', prompt: 'Digital glitch effect with fast RGB color splitting, static distortion, and erratic tearing over the text.' },
  { id: 'floating-ethereal', label: 'Floating Ethereal', prompt: 'Weightless, slow drifting motion of the text with a soft glowing aura, materializing like mist.' },
  { id: 'slam-impact', label: 'Slam Impact', prompt: 'Fast, violent text slam onto the screen, causing an aggressive camera shake and debris.' },
  { id: 'product-carousel', label: 'Product Carousel', prompt: 'Smooth tracking 360-degree rotation of the product with dynamic typography orbiting or appearing alongside it, highly commercial and polished.' }
];

export const STYLE_PREVIEWS = [
  { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'Neon-lit, high-tech, futuristic cyberpunk city street feeling, vibrant blue and pink lighting.', gradient: 'from-blue-600 to-pink-600' },
  { id: 'watercolor', label: 'Watercolor', prompt: 'Soft, delicate watercolor painting, pastel fluid colors bleeding into paper.', gradient: 'from-rose-200 to-teal-200' },
  { id: 'minimalist', label: 'Minimalist', prompt: 'Ultra clean, stark, minimalist design, stark white background with subtle smooth soft shadows.', gradient: 'from-stone-100 to-stone-300' },
  { id: 'neon-noir', label: 'Neon Noir', prompt: 'Dark, moody cinematic film noir but lit with electric green and deep purple neon tubes.', gradient: 'from-green-600 to-purple-800' },
  { id: 'claymation', label: 'Claymation', prompt: 'Stop-motion claymation style, tactile, hand-sculpted plasticine with fingerprints.', gradient: 'from-orange-400 to-red-500' }
];
