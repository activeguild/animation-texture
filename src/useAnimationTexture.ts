import { useCallback, useEffect, useState } from "react";
import framesWorker from "./worker.js?worker&inline";
import { CanvasTexture, LinearFilter } from "three";

interface UseAnimationTextureArgs {
  url: string;
  enabledInterval?: boolean;
  interval?: number;
  enabledLoop?: boolean;
}

const DEFAULT_ENABLED_INTERVAL = true;
const DEFAULT_INTERVAL = 100;
const DEFAULT_ENABLED_LOOP = true;

const framesMap = new Map<
  string,
  {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    images: ImageData[];
  }
>();
let worker: Worker;

const load = (url: UseAnimationTextureArgs["url"]) => {
  initializeWorker();

  if (framesMap.get(url)) {
    return;
  }

  fetch(url)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => {
      worker.postMessage({ url, arrayBuffer });
    });
};

export const preLoad = (url: UseAnimationTextureArgs["url"]) => {
  load(url);
};

const initializeWorker = () => {
  if (!worker) {
    worker = new framesWorker();
    worker.onmessage = (event) => {
      const { url, img, frames } = event.data;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }
      const isGif = url.endsWith(".gif");
      const images = frames.map((frame) => {
        const width = isGif ? frames[0].dims.width : img.width;
        const height = isGif ? frames[0].dims.height : img.height;

        canvas.width = width;
        canvas.height = height;

        if (isGif) {
          const imageData = ctx.createImageData(width, height);
          imageData.data.set(frame.patch);
          return imageData;
        } else {
          const imageData = new ImageData(
            isGif ? frame.patch : new Uint8ClampedArray(frame),
            width,
            height
          );
          return imageData;
        }
      });
      framesMap.set(url, { ctx, canvas, images });
    };
  }
};

export const useAnimationTexture = ({
  url,
  enabledInterval = DEFAULT_ENABLED_INTERVAL,
  interval = DEFAULT_INTERVAL,
  enabledLoop = DEFAULT_ENABLED_LOOP,
}: UseAnimationTextureArgs) => {
  const [animationTexture, setAnimationTexture] =
    useState<THREE.CanvasTexture | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const frameUpdate = useCallback(() => {
    const currentFrames = getFrameses(url);

    if (
      !enabledLoop &&
      currentFrames &&
      currentFrame + 1 === currentFrames.images.length
    ) {
      return;
    }

    if (currentFrames?.images.length === 1 && framesMap.size == 1) {
      return;
    }

    if (currentFrames && currentFrames.images.length > 0) {
      const tmpCurrentFrame = currentFrame + 1;
      const nextCurrentFrame = tmpCurrentFrame % currentFrames.images.length;
      const image = currentFrames.images[nextCurrentFrame];
      if (!animationTexture) {
        currentFrames.ctx.putImageData(image, 0, 0);
        const texture = new CanvasTexture(currentFrames.canvas);
        texture.premultiplyAlpha = true;
        texture.minFilter = LinearFilter;
        setAnimationTexture(texture);
      } else {
        animationTexture.image = image;
        animationTexture.needsUpdate = true;
      }

      setCurrentFrame(nextCurrentFrame);
    }
  }, [animationTexture, currentFrame, enabledLoop, url]);

  useEffect(() => {
    initializeWorker();
    load(url);

    const intervalForClear =
      enabledInterval && setInterval(frameUpdate, interval);

    return () => {
      intervalForClear && clearInterval(intervalForClear);
    };
  }, [enabledInterval, frameUpdate, interval, url]);

  useEffect(() => {
    return () => {
      worker?.terminate();
    };
  }, []);

  const getFrameses = (url: UseAnimationTextureArgs["url"]) => {
    return framesMap.get(url);
  };

  return { getFrameses, preLoad, animationTexture };
};
