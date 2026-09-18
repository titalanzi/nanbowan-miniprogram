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

// 执行随机分配（分层均衡：按实力等级分层轮转均分，等级优先、性别尽力；无等级者随机补）
function performRandomAssign({ randomGroups, allPlayers }) {
  const assignedGroups = randomGroups.map(g => ({
    id: g.id,
    name: g.name,
    color: g.color,
    captainId: g.captainId,
    captainName: g.captainName,
    fixedMemberIds: g.fixedMemberIds || [],
    members: []
  }))

  const groupCount = assignedGroups.length

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

  // 2. 剩余队员，按实力等级分层
  const remaining = allPlayers.filter(p => usedIds.indexOf(p.id) === -1)
  const isLeveled = p => p.level != null && p.level !== '' && !isNaN(Number(p.level))
  const leveledPlayers = remaining.filter(isLeveled)
  const unleveledPlayers = remaining.filter(p => !isLeveled(p))

  // 按等级分组，等级升序
  const levelMap = {}
  leveledPlayers.forEach(p => {
    const key = String(Number(p.level))
    if (!levelMap[key]) levelMap[key] = []
    levelMap[key].push(p)
  })
  const sortedLevels = Object.keys(levelMap).sort((a, b) => Number(a) - Number(b))

  // 3. 分层轮转分配：每层内随机打散，再尽量均匀分到各队（等级优先，性别尽力）
  const distribute = (players) => {
    const shuffled = shuffleArray([...players])
    const levelCountPerGroup = assignedGroups.map(() => 0) // 本层已放入数
    shuffled.forEach(p => {
      // 候选：本层人数最少的队；并列时选该性别人数较少的队（性别尽力）
      let best = -1
      let bestLevel = Infinity
      let bestGender = Infinity
      for (let i = 0; i < groupCount; i++) {
        const lc = levelCountPerGroup[i]
        const gc = assignedGroups[i].members.filter(m => m.gender === p.gender).length
        if (lc < bestLevel || (lc === bestLevel && gc < bestGender)) {
          bestLevel = lc
          bestGender = gc
          best = i
        }
      }
      if (best < 0) best = 0
      assignedGroups[best].members.push({ ...p, isCaptain: false, isFixed: false })
      levelCountPerGroup[best]++
    })
  }

  sortedLevels.forEach(lv => distribute(levelMap[lv]))
  // 4. 无等级的队员整体随机补入（保持性别尽力均衡）
  distribute(unleveledPlayers)

  // 5. 统计
  assignedGroups.forEach(g => {
    g.maleCount = g.members.filter(m => m.gender === 'male').length
    g.femaleCount = g.members.filter(m => m.gender === 'female').length
    g.memberCount = g.members.length
  })

  return assignedGroups
}

module.exports = {
  shuffleArray,
  performRandomAssign
}
