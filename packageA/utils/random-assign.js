/**
 * 随机分配算法模块
 */

// 随机洗牌
function shuffleArray(arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// 执行随机分配
function performRandomAssign({ randomGroups, allPlayers }) {
  const malePlayers = allPlayers.filter(p => p.gender === 'male')
  const femalePlayers = allPlayers.filter(p => p.gender === 'female')

  const assignedGroups = randomGroups.map(g => ({
    id: g.id,
    name: g.name,
    color: g.color,
    members: []
  }))

  // 1. 先放入队长和固定队员
  const usedIds = []
  randomGroups.forEach((g, i) => {
    const captain = allPlayers.find(p => p.id === g.captainId)
    if (captain) {
      assignedGroups[i].members.push({ ...captain, isCaptain: true, isFixed: true })
      usedIds.push(captain.id)
    }
    if (g.fixedMemberIds) {
      g.fixedMemberIds.forEach(fid => {
        if (usedIds.indexOf(fid) === -1) {
          const fp = allPlayers.find(p => p.id === fid)
          if (fp) {
            assignedGroups[i].members.push({ ...fp, isCaptain: false, isFixed: true })
            usedIds.push(fid)
          }
        }
      })
    }
  })

  // 2. 计算每队已有男女数，剩余需要分配的男女总数
  const remainingMale = malePlayers.filter(p => usedIds.indexOf(p.id) === -1)
  const remainingFemale = femalePlayers.filter(p => usedIds.indexOf(p.id) === -1)

  const groupCount = assignedGroups.length
  const totalMale = malePlayers.length
  const totalFemale = femalePlayers.length

  const targetMalePerGroup = Math.floor(totalMale / groupCount)
  const targetFemalePerGroup = Math.floor(totalFemale / groupCount)
  const extraMaleCount = totalMale % groupCount
  const extraFemaleCount = totalFemale % groupCount

  const maleNeeds = []
  const femaleNeeds = []
  for (let i = 0; i < groupCount; i++) {
    const curMale = assignedGroups[i].members.filter(m => m.gender === 'male').length
    const curFemale = assignedGroups[i].members.filter(m => m.gender === 'female').length
    maleNeeds.push(Math.max(0, targetMalePerGroup - curMale))
    femaleNeeds.push(Math.max(0, targetFemalePerGroup - curFemale))
  }

  const shuffledMale = shuffleArray([...remainingMale])
  const shuffledFemale = shuffleArray([...remainingFemale])

  // 3. 按需分配男生
  let maleIdx = 0
  for (let i = 0; i < groupCount && maleIdx < shuffledMale.length; i++) {
    for (let j = 0; j < maleNeeds[i] && maleIdx < shuffledMale.length; j++) {
      assignedGroups[i].members.push({ ...shuffledMale[maleIdx], isCaptain: false, isFixed: false })
      maleIdx++
    }
  }

  // 4. 按需分配女生
  let femaleIdx = 0
  for (let i = 0; i < groupCount && femaleIdx < shuffledFemale.length; i++) {
    for (let j = 0; j < femaleNeeds[i] && femaleIdx < shuffledFemale.length; j++) {
      assignedGroups[i].members.push({ ...shuffledFemale[femaleIdx], isCaptain: false, isFixed: false })
      femaleIdx++
    }
  }

  // 5. 分配余数男生
  const extraMaleIndices = shuffleArray([...Array(groupCount).keys()]).slice(0, extraMaleCount)
  extraMaleIndices.forEach(i => {
    if (maleIdx < shuffledMale.length) {
      assignedGroups[i].members.push({ ...shuffledMale[maleIdx], isCaptain: false, isFixed: false })
      maleIdx++
    }
  })

  // 6. 分配余数女生
  const extraFemaleIndices = shuffleArray([...Array(groupCount).keys()]).slice(0, extraFemaleCount)
  extraFemaleIndices.forEach(i => {
    if (femaleIdx < shuffledFemale.length) {
      assignedGroups[i].members.push({ ...shuffledFemale[femaleIdx], isCaptain: false, isFixed: false })
      femaleIdx++
    }
  })

  // 7. 分配剩余
  const randomExtraIndices = shuffleArray([...Array(groupCount).keys()])
  let extraPtr = 0
  while (maleIdx < shuffledMale.length) {
    assignedGroups[randomExtraIndices[extraPtr % groupCount]].members.push({ ...shuffledMale[maleIdx], isCaptain: false, isFixed: false })
    maleIdx++
    extraPtr++
  }
  extraPtr = 0
  while (femaleIdx < shuffledFemale.length) {
    assignedGroups[randomExtraIndices[extraPtr % groupCount]].members.push({ ...shuffledFemale[femaleIdx], isCaptain: false, isFixed: false })
    femaleIdx++
    extraPtr++
  }

  assignedGroups.forEach(g => {
    g.maleCount = g.members.filter(m => m.gender === 'male').length
    g.femaleCount = g.members.filter(m => m.gender === 'female').length
  })

  return assignedGroups
}

module.exports = {
  shuffleArray,
  performRandomAssign
}
