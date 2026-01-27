import { query } from "./_generated/server";

// Get public wonderings with profile info for landing page
export const getFeaturedWonderings = query({
  args: {},
  handler: async (ctx) => {
    const wonderings = await ctx.db.query("wonderings").order("desc").take(20);

    const result = await Promise.all(
      wonderings.map(async (wondering) => {
        const profile = await ctx.db.get(wondering.profileId);
        if (!profile) return null;

        // Get profile image URL if exists
        let imageUrl = profile.imageUrl;
        if (profile.imageStorageId) {
          imageUrl =
            (await ctx.storage.getUrl(profile.imageStorageId)) ?? undefined;
        }

        // Get wondering image URL if exists
        let wonderingImageUrl = null;
        if (wondering.imageStorageId) {
          wonderingImageUrl =
            (await ctx.storage.getUrl(wondering.imageStorageId)) ?? undefined;
        }

        return {
          _id: wondering._id,
          prompt: wondering.prompt,
          wonderingImageUrl,
          profile: {
            _id: profile._id,
            name: profile.name,
            imageUrl,
            jobFunctions: profile.jobFunctions?.slice(0, 2) || [],
          },
        };
      }),
    );

    return result.filter((w) => w !== null);
  },
});

// Get public works with profile info for landing page
export const getFeaturedWorks = query({
  args: {},
  handler: async (ctx) => {
    const artifacts = await ctx.db.query("artifacts").order("desc").take(20);

    const result = await Promise.all(
      artifacts.map(async (artifact) => {
        const profile = await ctx.db.get(artifact.profileId);
        if (!profile) return null;

        // Get profile image URL if exists
        let profileImageUrl = profile.imageUrl;
        if (profile.imageStorageId) {
          profileImageUrl =
            (await ctx.storage.getUrl(profile.imageStorageId)) ?? undefined;
        }

        // Get artifact media URL
        let mediaUrl = artifact.mediaUrl;
        if (artifact.mediaStorageId) {
          mediaUrl =
            (await ctx.storage.getUrl(artifact.mediaStorageId)) ?? undefined;
        }

        return {
          _id: artifact._id,
          type: artifact.type,
          title: artifact.title,
          content: artifact.content,
          mediaUrl,
          ogImageUrl: artifact.ogImageUrl,
          profile: {
            _id: profile._id,
            name: profile.name,
            imageUrl: profileImageUrl,
            jobFunctions: profile.jobFunctions?.slice(0, 2) || [],
          },
        };
      }),
    );

    return result.filter((w) => w !== null);
  },
});

// Get featured profiles for landing page
export const getFeaturedProfiles = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").order("desc").take(20);

    const result = await Promise.all(
      profiles.map(async (profile) => {
        let imageUrl = profile.imageUrl;
        if (profile.imageStorageId) {
          imageUrl =
            (await ctx.storage.getUrl(profile.imageStorageId)) ?? undefined;
        }

        return {
          _id: profile._id,
          name: profile.name,
          imageUrl,
          jobFunctions: profile.jobFunctions?.slice(0, 2) || [],
          bio: profile.bio,
        };
      }),
    );

    return result;
  },
});
