import { connectDB } from '../../db/connection.js';

export async function checkProcessedToday(postId) {
  const db = await connectDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existing = await db.collection('opportunities').findOne({
    postId,
    $or: [
      { sentAt: { $gte: today } },
      { processedToday: true, updatedAt: { $gte: today } }
    ]
  });
  
  if (existing) {
    return true;
  }
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const sentToday = await db.collection('opportunities').findOne({
    postId,
    sentAt: { $gte: todayStart }
  });
  
  return !!sentToday;
}

export async function markProcessedToday(postId) {
  const db = await connectDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  await db.collection('opportunities').updateOne(
    { postId },
    { 
      $set: { 
        processedToday: true,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
}

export async function getSentTodayCount(platform) {
  const db = await connectDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await db.collection('opportunities').countDocuments({
    sourcePlatform: platform,
    sentAt: { $gte: today }
  });
}

export async function updatePostAsSent(postId) {
  const db = await connectDB();
  await db.collection('opportunities').updateOne(
    { postId },
    { 
      $set: { 
        sentAt: new Date(),
        processedToday: true
      } 
    }
  );
}

