const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const results = []

    await createUniqueIndex('users', 'openid', results)
    await createUniqueIndex('users', 'id', results)

    await createIndex('trainings', 'creatorId', results)
    await createIndex('trainings', 'status', results)
    await createIndex('trainings', 'createdAt', results)

    await createIndex('matches', 'creatorId', results)
    await createIndex('matches', 'status', results)
    await createIndex('matches', 'createdAt', results)

    await createIndex('training_attendees', 'trainingId', results)
    await createIndex('training_attendees', 'userOpenId', results)

    return {
      success: true,
      message: '索引创建完成',
      results: results
    }
  } catch (error) {
    console.error('initIndexes error:', error)
    return {
      success: false,
      message: error.message || '索引创建失败'
    }
  }
}

async function createUniqueIndex(collectionName, fieldName, results) {
  try {
    console.log(`Creating unique index on ${collectionName}.${fieldName}...`)
    await db.collection(collectionName).addIndex({
      [`${fieldName}`]: 1
    }, { unique: true })
    results.push({
      collection: collectionName,
      field: fieldName,
      type: 'unique',
      status: 'success',
      message: `唯一索引创建成功`
    })
    console.log(`Unique index on ${collectionName}.${fieldName} created successfully`)
  } catch (error) {
    if (error.message && error.message.includes('duplicate key')) {
      results.push({
        collection: collectionName,
        field: fieldName,
        type: 'unique',
        status: 'warning',
        message: `索引创建失败，存在重复数据，请先清理重复记录`
      })
    } else if (error.message && error.message.includes('already exists')) {
      results.push({
        collection: collectionName,
        field: fieldName,
        type: 'unique',
        status: 'info',
        message: `索引已存在`
      })
    } else {
      results.push({
        collection: collectionName,
        field: fieldName,
        type: 'unique',
        status: 'error',
        message: error.message || '未知错误'
      })
    }
    console.error(`Failed to create unique index on ${collectionName}.${fieldName}:`, error)
  }
}

async function createIndex(collectionName, fieldName, results) {
  try {
    console.log(`Creating index on ${collectionName}.${fieldName}...`)
    await db.collection(collectionName).addIndex({
      [`${fieldName}`]: 1
    })
    results.push({
      collection: collectionName,
      field: fieldName,
      type: 'normal',
      status: 'success',
      message: `索引创建成功`
    })
    console.log(`Index on ${collectionName}.${fieldName} created successfully`)
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      results.push({
        collection: collectionName,
        field: fieldName,
        type: 'normal',
        status: 'info',
        message: `索引已存在`
      })
    } else {
      results.push({
        collection: collectionName,
        field: fieldName,
        type: 'normal',
        status: 'error',
        message: error.message || '未知错误'
      })
    }
    console.error(`Failed to create index on ${collectionName}.${fieldName}:`, error)
  }
}