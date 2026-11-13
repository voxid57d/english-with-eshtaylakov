// Renders a chart SVG to a 2x JPG and downloads it. Interaction overlays are stripped.
export async function downloadSvgAsJpg(svg: SVGSVGElement, width: number, height: number, filename: string, background = "#0b1220") {
   let sourceUrl: string | undefined;
   let downloadUrl: string | undefined;
   try {
      const exported = svg.cloneNode(true) as SVGSVGElement;
      exported.querySelectorAll("[data-chart-interaction]").forEach((element) => element.remove());
      const source = new XMLSerializer().serializeToString(exported);
      sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
      const picture = new Image();
      picture.src = sourceUrl;
      await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width * 2; canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export is unavailable in this browser.");
      context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not create the JPG.")), "image/jpeg", 0.96));
      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
   } finally {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (downloadUrl) { const url = downloadUrl; window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
   }
}
