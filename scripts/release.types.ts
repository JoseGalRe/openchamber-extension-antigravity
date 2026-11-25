/**
 * The part of a Gitea release this script uses, as the Gitea API returns it.
 */
export type GiteaRelease = {
  /**
   * The release's numeric ID, used in the API paths that edit it and its assets.
   */
  readonly id: number;
  /**
   * The release page shown to people.
   */
  readonly html_url: string;
  /**
   * The files attached to the release.
   */
  readonly assets: readonly GiteaReleaseAsset[];
};

/**
 * A file attached to a Gitea release.
 */
export type GiteaReleaseAsset = {
  /**
   * The asset's numeric ID, used to delete it before uploading a new build.
   */
  readonly id: number;
  /**
   * The file name (`openchamber-extension-antigravity-0.1.0.zip`).
   */
  readonly name: string;
};
