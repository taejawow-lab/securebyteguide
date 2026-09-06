import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(100),
    description: z.string().max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    heroIllustration: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.string(),

    sources: z
      .array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          author: z.string().optional(),
          year: z.string().optional(),
          publication: z.string().optional(),
        })
      )
      .min(8, 'At least 8 credible sources are required'),
    visualsCount: z.number().min(5, 'At least 5 editorial visuals are required'),
    hasVideo: z.boolean().default(false), // v5.3 #14
    wordCount: z.number().min(1500, 'At least 1500 English words are required'),

    affiliate: z.boolean().default(false),

    aiDisclosed: z.boolean().default(true),
    schemaType: z.enum(['Article', 'Review', 'HowTo', 'NewsArticle']).default('Article'),

    // FAQ (v5.4 #11)
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .optional(),

    // Optional article-specific takeaways
    takeaways: z.array(z.string()).min(1).max(5).optional(),

    // Internal links (v5.4 #10)
    internalLinks: z.array(z.string()).optional(),

    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
