function rewriteAssetUrl(assetUrl) {
  const parsedUrl = new URL(assetUrl, "https://ctfassets.net"); // accepts URLs with and without scheme
  const subdomain = parsedUrl.hostname.split(".")[0]; // images, downloads, assets, videos
  parsedUrl.hostname = "assets.mycorp.com"; // Your asset service's hostname goes here
  parsedUrl.pathname = `/${subdomain}${parsedUrl.pathname}`;
  return parsedUrl.toString();
}

function rewriteAllAssetUrls(assetMetadata) {
  if (!assetMetadata.fields || !assetMetadata.fields.file) {
    return assetMetadata;
  }

  // Shallow clone "file" field
  const fileField = { ...assetMetadata.fields.file };

  for (const [locale, fileData] of Object.entries(fileField)) {
    if (fileData.url) {
      fileField[locale] = {
        ...fileData,
        url: rewriteAssetUrl(fileData.url),
      };
    }
  }

  return {
    ...assetMetadata,
    fields: {
      ...assetMetadata.fields,
      file: fileField,
    },
  };
}
