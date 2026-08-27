/**
 * @file LimitSingleDayFreeFromDutyForCARSRule.cpp
 * @brief 法规 7501 — 滚动小时窗口内最少 SDFD 检查（事件扫描滑窗）。
 *
 * 三阶段流水线：
 *   阶段1  BuildTrueRestPeriods      — 提取 True Rest（duty 间空隙 + duty-end buffer）
 *   阶段2  BuildValidSdfdList         — 裁剪合法 SDFD（连续 Local Night，无 duty 穿插）
 *   阶段3  CheckSweepRollingWindows   — 整分钟粒度滑窗，统计每窗口完全包含 SDFD 数
 *
 * SDFD 计入条件（完全包含，flexible local night 放置）：
 *   存在合法 night1 起点 s、night2 终点 e，使 s >= windowStart 且 e <= windowEnd
 *
 * Debug：环境变量 RULE7501_DEBUG=1 输出 stderr 与规则日志。
 */

#include "LimitSingleDayFreeFromDutyForCARSRule.h"

#include <algorithm>
#include <cstdarg>
#include <climits>
#include <cstdlib>
#include <cstdio>
#include <set>
#include <vector>

#include "Duty.h"
#include "Log/Logger.h"
#include "RuleParams.h"
#include "Utility.h"

#include "../framework/period/WorkPeriod.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"

namespace {

    constexpr time_t kSecondsPerDay = 86400;

    /**
     * @brief 读取环境变量 RULE7501_DEBUG，决定是否输出调试日志。
     * @return true 已开启（非空且非 '0'）
     */
    bool IsRule7501DebugEnabled() {
        static int enabled = -1;
        if (enabled < 0) {
            const char* env = std::getenv("RULE7501_DEBUG");
            enabled = (env != nullptr && env[0] != '\0' && env[0] != '0') ? 1 : 0;
        }
        return enabled != 0;
    }

    /**
     * @brief 格式化输出 7501 调试信息到规则日志与 stderr（需 RULE7501_DEBUG=1）。
     * @param fmt printf 风格格式串
     */
    void Rule7501DebugLog(const char* fmt, ...) {
        if (!IsRule7501DebugEnabled()) {
            return;
        }
        char buffer[512];
        va_list args;
        va_start(args, fmt);
        vsnprintf(buffer, sizeof(buffer), fmt, args);
        va_end(args);
        Logger::getRuleLogger()->info("[Rule7501] {}", buffer);
        fprintf(stderr, "[Rule7501] %s\n", buffer);
    }

    /** True Rest 区间：duty 结束 buffer 之后至下一 duty 开始（或扫描边界）之间的纯休息段。 */
    struct RestSegment {
        time_t startUtc = 0;       ///< 休息段有效起点 UTC（已加 duty-end buffer）
        time_t endUtc = 0;         ///< 休息段终点 UTC
        int accOffsetMinutes = 0;  ///< 适应时区偏移（分钟），用于 Local Night 计算
        std::string zoneId;        ///< IANA 时区 ID（如 America/Toronto），优先于固定 offset
    };

    /**
     * @brief 在 Local Night band 与 True Rest 交集内，合法 9 小时 local night 的可选起点范围。
     *
     * band 内任意连续 MinRestInterval（如 9h）且完全落在 band 与 rest 内的段均合法；
     * 例如 22:31–07:31 合法，不必锚在 22:30。
     */
    struct FlexibleLocalNightSegment {
        time_t earliestStartUtc = 0;
        time_t latestStartUtc = 0;
        time_t segmentSeconds = 0;
        bool valid = false;
    };

    /** 合法 SDFD：连续两个 flexible local night 之间无 duty；起止为各 night 可选段范围。 */
    struct SdfdInterval {
        time_t startEarliestUtc = 0;  ///< 第一个 local night 最早合法起点
        time_t startLatestUtc = 0;    ///< 第一个 local night 最晚合法起点
        time_t endEarliestUtc = 0;    ///< 第二个 local night 最早合法终点（start+9h）
        time_t endLatestUtc = 0;      ///< 第二个 local night 最晚合法终点（start+9h）
    };

    /**
     * @brief 从全局 Local Night 定义（法规 2014014）读取最小休息时长（秒）。
     *
     * 用于判断 SDFD 裁剪时，Local Night 边界到 True Rest 边界是否满足 MinRestInterval（如 09:00）。
     */
    int GetMinLocalNightRestSeconds() {
        return TimeUtils::hhmmToMinutes(RuleParams::GetInstancePtr()->getLocalNightDefinition().MinRestInterval) * 60;
    }

    /**
     * @brief 获取 True Rest 段起点处的适应时区偏移（分钟）。
     *
     * 优先级：前一 FltDuty 的 dutyEndRefTimeZone → refTimeZone → roster 结束站 offset。
     * 用于 BuildValidSdfdList 中将 UTC 映射到 Local Night。
     *
     * @param prevWork 该休息段之前结束的 WorkPeriod（可为 leading rest 后的第一个 duty 的前驱）
     * @param dbData   数据上下文（机场时区表）
     */
    int GetAccOffsetAtRestStart(const WorkPeriod* prevWork, const SharedPtr<CrewDataContext>& dbData) {
        if (prevWork == nullptr) {
            return 0;
        }
        if (prevWork->GetWorkType() == WorkType::FltDuty) {
            const auto* duty = static_cast<const Duty*>(prevWork->GetWork());
            if (duty == nullptr) {
                return 0;
            }
            const int dutyEndRefTz = duty->getDutyEndRefTimeZone();
            if (dutyEndRefTz >= 0) {
                return dutyEndRefTz;
            }
            return duty->getRefTimeZone();
        }

        if (prevWork->GetWork() == nullptr) {
            return 0;
        }
        return RosterUtils::GetTimeZoneOffset(prevWork->GetEndTimeUTC(), prevWork->GetEndStation(), dbData);
    }

    /**
     * @brief 获取 WorkPeriod 站点对应的 IANA 时区 ID（用于 Local Night 计算）。
     *
     * @param atStart true=取开始站，false=取结束站；空站返回空串（fallback 到固定 offset）。
     */
    std::string GetWorkPeriodStationZoneId(const WorkPeriod* work,
                                           const SharedPtr<CrewDataContext>& dbData,
                                           bool atStart) {
        if (work == nullptr || dbData == nullptr) {
            return {};
        }
        const std::string station = atStart ? work->GetStartStation() : work->GetEndStation();
        if (station.empty()) {
            return {};
        }
        return dbData->getAirportZoneId(station);
    }

    /**
     * @brief 获取 leading True Rest（首个 duty 之前）的适应时区偏移。
     *
     * 用于扫描起点之前、第一个 WorkPeriod 开始前的休息段 Local Night 计算。
     */
    int GetAccOffsetBeforeFirstWork(const WorkPeriod* firstWork, const SharedPtr<CrewDataContext>& dbData) {
        if (firstWork == nullptr) {
            return 0;
        }
        if (firstWork->GetWorkType() == WorkType::FltDuty) {
            const auto* duty = static_cast<const Duty*>(firstWork->GetWork());
            if (duty != nullptr) {
                const int refTz = duty->getRefTimeZone();
                if (refTz >= 0) {
                    return refTz;
                }
            }
        }
        const int accAtStart = firstWork->GetAccTimezoneAtStart();
        if (accAtStart != 0 || firstWork->GetWorkType() == WorkType::FltDuty) {
            return accAtStart;
        }
        return RosterUtils::GetTimeZoneOffset(firstWork->GetStartTimeUTC(), firstWork->GetStartStation(), dbData);
    }

    /**
     * @brief 判断两个半开区间 [aStart,aEnd) 与 [bStart,bEnd) 是否有重叠。
     */
    bool IntervalsOverlap(time_t aStart, time_t aEnd, time_t bStart, time_t bEnd) {
        return aEnd > bStart && aStart < bEnd;
    }

    /** @brief UTC 时间戳向下取整到分钟（滑窗起点粒度）。 */
    time_t RoundDownToMinute(time_t utc) {
        return utc - (utc % 60);
    }

    /** @brief UTC 时间戳向上取整到分钟（SDFD 进入滑窗计数的事件时刻）。 */
    time_t RoundUpToMinute(time_t utc) {
        const time_t remainder = utc % 60;
        return remainder == 0 ? utc : utc + (60 - remainder);
    }

    /**
     * @brief ROSTER_OPTIMIZER 下判断滚动窗口内是否存在 RO 新分配任务（source != PA）。
     *
     * 与 8024/7505 的 Utility::hasROAssignedRosterInRange 语义一致；窗口内全部为预占 (PA) 时返回 false。
     */
    bool HasRoAssignedRosterInRange(const std::vector<const ROSTER*>& rosters, time_t start, time_t end) {
        for (const ROSTER* roster : rosters) {
            if (roster == nullptr) {
                continue;
            }
            if (Utility::GetInstancePtr()->isTimeOverlap(roster->actStrUtc, roster->actEndUtc, start, end) &&
                roster->source != "PA") {
                return true;
            }
        }
        return false;
    }

    /** @brief 168/672 RH 参数在 ROSTER_OPTIMIZER 下需区分预占与 CR 任务。 */
    bool ShouldApplyOptimizerPaIgnore(int periodHours) {
        return periodHours == 168 || periodHours == 672;
    }

    /**
     * @brief 在 band∩rest 内计算合法 local night 9h 段的可选起点范围。
     *
     * @param band           日历日 local night band（如 22:30–09:30）
     * @param restStartUtc   True Rest 起点
     * @param restEndUtc     True Rest 终点
     * @param minRestSeconds MinRestInterval 秒数（如 9h）
     */
    FlexibleLocalNightSegment ComputeFlexibleLocalNightSegment(const DutyUtils::LocalNightUtcWindow& band,
                                                               time_t restStartUtc,
                                                               time_t restEndUtc,
                                                               time_t minRestSeconds) {
        FlexibleLocalNightSegment segment;
        segment.segmentSeconds = minRestSeconds;
        if (!band.valid || minRestSeconds <= 0) {
            return segment;
        }

        const time_t availStart = std::max(band.startUtc, restStartUtc);
        const time_t availEnd = std::min(band.endUtc, restEndUtc);
        if (availEnd - availStart < minRestSeconds) {
            return segment;
        }

        const time_t earliestStart = availStart;
        const time_t latestStart = std::min(band.endUtc - minRestSeconds, availEnd - minRestSeconds);
        if (earliestStart > latestStart) {
            return segment;
        }

        segment.earliestStartUtc = earliestStart;
        segment.latestStartUtc = latestStart;
        segment.valid = true;
        return segment;
    }

    /**
     * @brief 判断开区间 (openStartUtc, openEndUtc) 内是否存在任何 WorkPeriod。
     *
     * 用于 SDFD 裁剪：两个 consecutive Local Night 之间（night1.end, night2.start）不得有 duty。
     */
    bool HasWorkInOpenInterval(time_t openStartUtc,
                               time_t openEndUtc,
                               const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) {
        if (openEndUtc <= openStartUtc) {
            return false;
        }
        for (const auto& work : workPeriods) {
            if (work == nullptr) {
                continue;
            }
            if (IntervalsOverlap(work->GetStartTimeUTC(), work->GetEndTimeUTC(), openStartUtc, openEndUtc)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @brief 【阶段1】从 WorkPeriod 序列构建 True Rest 段列表。
     *
     * True Rest 定义：
     * - leading：scanStart 至第一个 duty 开始
     * - 中间：相邻 duty 之间，起点 = 前 duty 结束 + dutyEndBuffer
     * - trailing：最后 duty 结束 + buffer 至 trailingRestEndUtc
     *
     * @param workPeriods          组员全部 WorkPeriod（时间有序）
     * @param dutyEndBufferMinutes 参数 DUTY END BUFFER（分钟），duty 结束后不计入休息的缓冲
     * @param leadingRestStartUtc  扫描下界（通常为 checkedStart - period）
     * @param trailingRestEndUtc     扫描上界（通常为 lastDutyEnd + period）
     * @param dbData               时区/机场数据
     * @return 带 accOffset 与 zoneId 的 RestSegment 列表
     */
    std::vector<RestSegment> BuildTrueRestPeriods(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
                                                    int dutyEndBufferMinutes,
                                                    time_t leadingRestStartUtc,
                                                    time_t trailingRestEndUtc,
                                                    const SharedPtr<CrewDataContext>& dbData) {
        std::vector<RestSegment> restSegments;
        if (workPeriods.empty()) {
            return restSegments;
        }

        const WorkPeriod* firstWork = workPeriods.front().get();
        const time_t firstWorkStartUtc = firstWork->GetStartTimeUTC();
        if (firstWorkStartUtc > leadingRestStartUtc) {
            RestSegment leadingRest;
            leadingRest.startUtc = leadingRestStartUtc;
            leadingRest.endUtc = firstWorkStartUtc;
            leadingRest.accOffsetMinutes = GetAccOffsetBeforeFirstWork(firstWork, dbData);
            leadingRest.zoneId = GetWorkPeriodStationZoneId(firstWork, dbData, true);
            restSegments.push_back(leadingRest);
        }

        const time_t bufferSeconds = static_cast<time_t>(dutyEndBufferMinutes) * 60;
        /** 追加一段中间/尾部 True Rest：起点 = restStartUtc + dutyEndBuffer，终点 = restEndUtc。 */
        auto appendRest = [&](const WorkPeriod* prevWork, time_t restStartUtc, time_t restEndUtc) {
            if (restEndUtc <= restStartUtc) {
                return;
            }
            RestSegment segment;
            segment.startUtc = restStartUtc + bufferSeconds;
            segment.endUtc = restEndUtc;
            if (segment.endUtc <= segment.startUtc) {
                return;
            }
            segment.accOffsetMinutes = GetAccOffsetAtRestStart(prevWork, dbData);
            segment.zoneId = GetWorkPeriodStationZoneId(prevWork, dbData, false);
            restSegments.push_back(segment);
        };

        for (size_t i = 0; i + 1 < workPeriods.size(); ++i) {
            appendRest(workPeriods[i].get(), workPeriods[i]->GetEndTimeUTC(), workPeriods[i + 1]->GetStartTimeUTC());
        }
        appendRest(workPeriods.back().get(), workPeriods.back()->GetEndTimeUTC(), trailingRestEndUtc);
        return restSegments;
    }

    /**
     * @brief 【阶段2】从 True Rest 裁剪所有合法 SDFD 区间。
     *
     * 算法：
     * 1. 对每个 RestSegment，按 Local Night 定义列出覆盖的日历日
     * 2. 找连续两日 (day, day+1) 构成一对 Local Night
     * 3. 两 Local Night band 之间的日间开区间不得有 duty
     * 4. 在 band∩rest 内求各 night 合法 9h 段的可选起点范围（不必锚 22:30）
     * 5. SDFD 起止 = [night1 最早/最晚起点, night2 最早/最晚起点+9h]
     *
     * @param trueRestPeriods 阶段1 输出
     * @param workPeriods     用于检测 Local Night 间是否有 duty
     * @return 按发现顺序的 SdfdInterval 列表
     */
    std::vector<SdfdInterval> BuildValidSdfdList(
        const std::vector<RestSegment>& trueRestPeriods,
        const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) {
        std::vector<SdfdInterval> validSdfdList;
        const time_t minRestSeconds = GetMinLocalNightRestSeconds();

        for (const RestSegment& rest : trueRestPeriods) {
            const std::vector<time_t> localNightDates =
                rest.zoneId.empty()
                    ? DutyUtils::GetLocalNightDates(rest.startUtc, rest.endUtc, rest.accOffsetMinutes)
                    : DutyUtils::GetLocalNightDates(rest.startUtc, rest.endUtc, rest.accOffsetMinutes, rest.accOffsetMinutes, rest.zoneId);
            if (localNightDates.size() < 2) {
                continue;
            }

            for (size_t i = 0; i + 1 < localNightDates.size(); ++i) {
                const time_t day1Key = localNightDates[i];
                const time_t day2Key = localNightDates[i + 1];
                if (day2Key != day1Key + kSecondsPerDay) {
                    continue;
                }

                const DutyUtils::LocalNightUtcWindow band1 =
                    DutyUtils::GetLocalNightWindowUtc(day1Key, rest.accOffsetMinutes, rest.zoneId);
                const DutyUtils::LocalNightUtcWindow band2 =
                    DutyUtils::GetLocalNightWindowUtc(day2Key, rest.accOffsetMinutes, rest.zoneId);
                if (!band1.valid || !band2.valid) {
                    continue;
                }

                if (HasWorkInOpenInterval(band1.endUtc, band2.startUtc, workPeriods)) {
                    continue;
                }

                const FlexibleLocalNightSegment night1 =
                    ComputeFlexibleLocalNightSegment(band1, rest.startUtc, rest.endUtc, minRestSeconds);
                const FlexibleLocalNightSegment night2 =
                    ComputeFlexibleLocalNightSegment(band2, rest.startUtc, rest.endUtc, minRestSeconds);
                if (!night1.valid || !night2.valid) {
                    continue;
                }

                const time_t sdfdEndEarliest = night2.earliestStartUtc + minRestSeconds;
                const time_t sdfdEndLatest = night2.latestStartUtc + minRestSeconds;

                validSdfdList.push_back({night1.earliestStartUtc, night1.latestStartUtc, sdfdEndEarliest,
                                         sdfdEndLatest});
            }
        }

        return validSdfdList;
    }

    /**
     * @brief 判断滚动窗口 [windowStart, windowEnd] 是否应参与 7501 校验。
     *
     * 过滤纯空窗、纯 duty 无休息、以及末 duty 之后的纯 trailing rest 等无业务意义的窗口：
     * - 窗口内须含 rest
     * - 无 work 且 windowStart >= lastWorkEndUtc 的尾部纯休息窗跳过
     *
     * @param windowStartUtc  候选窗口起点
     * @param windowEndUtc    候选窗口终点（= 起点 + period 小时）
     * @param lastWorkEndUtc  最后一个 WorkPeriod 结束 UTC
     */
    bool ShouldCheckWindow(time_t windowStartUtc,
                           time_t windowEndUtc,
                           time_t lastWorkEndUtc,
                           const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
                           const std::vector<RestSegment>& trueRestPeriods) {
        bool hasWork = false;
        for (const auto& work : workPeriods) {
            if (work != nullptr &&
                IntervalsOverlap(work->GetStartTimeUTC(), work->GetEndTimeUTC(), windowStartUtc, windowEndUtc)) {
                hasWork = true;
                break;
            }
        }

        bool hasRest = false;
        for (const RestSegment& rest : trueRestPeriods) {
            if (IntervalsOverlap(rest.startUtc, rest.endUtc, windowStartUtc, windowEndUtc)) {
                hasRest = true;
                break;
            }
        }

        if (!hasRest) {
            return false;
        }
        if (!hasWork && windowStartUtc >= lastWorkEndUtc) {
            return false;
        }
        return true;
    }

    /** 滑窗扫描事件：在 timeUtc 处 SDFD 完全包含计数变化 +1（进入）或 -1（离开）。 */
    struct SdfdSweepEvent {
        time_t timeUtc = 0;
        int delta = 0;
    };

    /**
     * @brief 收集所有候选窗口起点（整分钟）及 SDFD 计数变化事件。
     *
     * 对每个 SDFD（flexible 起止范围）：窗口起点 t 能完全包含它当且仅当 CanFullyContainSdfd(t, t+W)。
     * 等价整分钟起点 t ∈ [RoundUp(endEarliest-W), RoundDown(startLatest)]；
     * 事件：+1 于 firstValidWindowStart，-1 于 lastValidWindowStart+60。
     *
     * 同时从 work/rest 边界、checkedStart/scanEnd 收集临界点（向下取整到分钟），
     * 保证 O(N log N) sweep 不漏检最优/最差窗口。
     *
     * @param[out] sdfdEvents    SDFD 计数增减事件（按 timeUtc 排序后 sweep）
     * @param[out] criticalTimes 待检查的窗口起点集合（整分钟，有序 set）
     */
    void CollectWindowStartCriticalTimes(time_t rosterCheckedStartUtc,
                                         time_t scanEndUtc,
                                         time_t windowSeconds,
                                         const std::vector<SdfdInterval>& validSdfdList,
                                         const std::vector<RestSegment>& trueRestPeriods,
                                         const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
                                         std::vector<SdfdSweepEvent>& sdfdEvents,
                                         std::set<time_t>& criticalTimes) {
        /** 将候选窗口起点 t 向下取整到分钟后加入 criticalTimes（忽略 t<=0）。 */
        auto addCritical = [&](time_t t) {
            if (t > 0) {
                criticalTimes.insert(RoundDownToMinute(t));
            }
        };

        for (const SdfdInterval& sdfd : validSdfdList) {
            const time_t lastValidWindowStart = RoundDownToMinute(sdfd.startLatestUtc);
            const time_t firstValidWindowStart = RoundUpToMinute(sdfd.endEarliestUtc - windowSeconds);
            if (firstValidWindowStart > lastValidWindowStart) {
                continue;
            }
            sdfdEvents.push_back({firstValidWindowStart, 1});
            sdfdEvents.push_back({lastValidWindowStart + 60, -1});
            addCritical(firstValidWindowStart);
            addCritical(lastValidWindowStart);
            addCritical(lastValidWindowStart + 60);
        }

        for (const auto& work : workPeriods) {
            if (work == nullptr) {
                continue;
            }
            const time_t ws = work->GetStartTimeUTC();
            const time_t we = work->GetEndTimeUTC();
            addCritical(ws - windowSeconds + 1);
            addCritical(ws);
            addCritical(we);
            addCritical(we - windowSeconds + 1);
        }

        for (const RestSegment& rest : trueRestPeriods) {
            addCritical(rest.startUtc - windowSeconds + 1);
            addCritical(rest.startUtc);
            addCritical(rest.endUtc);
            addCritical(rest.endUtc - windowSeconds + 1);
        }

        addCritical(rosterCheckedStartUtc - windowSeconds);
        addCritical(rosterCheckedStartUtc);
        addCritical(scanEndUtc - windowSeconds);
        addCritical(scanEndUtc);
    }

    /**
     * @brief 【阶段3】事件扫描滑窗：校验全部候选窗口起点，O(N log N)。
     *
     * 对每个整分钟窗口起点：
     * 1. 累加 sdfdEvents 得到 currentSdfd（该起点下完全包含的 SDFD 数）
     * 2. 过滤扫描范围外、ShouldCheckWindow=false 的窗口
     * 3. 若 currentSdfd < minLimits → 记录最差窗口，OPTIMIZER 模式下可立即返回
     *
     * @param rosterCheckedStartUtc 法规检查起点（窗口须满足 windowEnd > 此值）
     * @param scanEndUtc            扫描上界（窗口须满足 windowStart < 此值）
     * @param windowSeconds         PERIOD × 3600
     * @param lastWorkEndUtc        末 duty 结束，供 ShouldCheckWindow
     * @param minLimits             MIN LIMITS 参数
     * @param stopOnFirstViolation  true=ROSTER_OPTIMIZER 遇首个违规即停；false=找全局最差
     * @param periodHours           参数 PERIOD（小时）；168/672 在 OPTIMIZER 下忽略纯 PA 窗口违规
     * @param rosters               组员 roster 列表，供 PA/CR 来源判断
     * @param[out] worstSdfd         最少 SDFD 数（违规时）
     * @param[out] worstWindowStart  最差窗口起点
     * @param[out] worstWindowEnd    最差窗口终点
     * @return true 全部合法窗口通过；false 存在违规
     */
    bool CheckSweepRollingWindows(time_t rosterCheckedStartUtc,
                                  time_t scanEndUtc,
                                  time_t windowSeconds,
                                  time_t lastWorkEndUtc,
                                  int minLimits,
                                  const std::vector<RestSegment>& trueRestPeriods,
                                  const std::vector<SdfdInterval>& validSdfdList,
                                  const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
                                  int periodHours,
                                  const std::vector<const ROSTER*>& rosters,
                                  int* worstSdfd,
                                  time_t* worstWindowStart,
                                  time_t* worstWindowEnd,
                                  bool stopOnFirstViolation) {
        std::vector<SdfdSweepEvent> sdfdEvents;
        std::set<time_t> criticalTimes;
        CollectWindowStartCriticalTimes(rosterCheckedStartUtc, scanEndUtc, windowSeconds,
                                        validSdfdList, trueRestPeriods, workPeriods, sdfdEvents, criticalTimes);
        if (criticalTimes.empty()) {
            return true;
        }

        std::sort(sdfdEvents.begin(), sdfdEvents.end(),
                  [](const SdfdSweepEvent& a, const SdfdSweepEvent& b) {
                      return a.timeUtc != b.timeUtc ? a.timeUtc < b.timeUtc : a.delta > b.delta;
                  });

        const std::vector<time_t> times(criticalTimes.begin(), criticalTimes.end());
        const time_t minWindowStart = RoundUpToMinute(rosterCheckedStartUtc - windowSeconds + 1);
        const time_t maxWindowStart = RoundDownToMinute(scanEndUtc - 1);

        size_t eventIdx = 0;
        int currentSdfd = 0;
        bool valid = true;

        Rule7501DebugLog(
            "CheckSweepRollingWindows windowHours=%lld minLimits=%d segments=%zu validSdfd=%zu scanStart=%lld scanEnd=%lld",
            static_cast<long long>(windowSeconds / 3600), minLimits, times.size(), validSdfdList.size(),
            static_cast<long long>(rosterCheckedStartUtc - windowSeconds), static_cast<long long>(scanEndUtc));

        for (size_t i = 0; i < times.size(); ++i) {
            while (eventIdx < sdfdEvents.size() && sdfdEvents[eventIdx].timeUtc <= times[i]) {
                currentSdfd += sdfdEvents[eventIdx].delta;
                ++eventIdx;
            }

            const time_t windowStart = times[i];
            if (windowStart < minWindowStart || windowStart > maxWindowStart) {
                continue;
            }

            const time_t windowEnd = windowStart + windowSeconds;
            if (windowEnd <= rosterCheckedStartUtc || windowStart >= scanEndUtc) {
                Rule7501DebugLog("  skip winStart=%lld winEnd=%lld (out of scan range)",
                                 static_cast<long long>(windowStart), static_cast<long long>(windowEnd));
                continue;
            }
            if (!ShouldCheckWindow(windowStart, windowEnd, lastWorkEndUtc, workPeriods, trueRestPeriods)) {
                Rule7501DebugLog("  skip winStart=%lld winEnd=%lld (ShouldCheckWindow=false)",
                                 static_cast<long long>(windowStart), static_cast<long long>(windowEnd));
                continue;
            }

            Rule7501DebugLog("  segment winStart=%lld winEnd=%lld sdfd=%d need=%d %s",
                             static_cast<long long>(windowStart), static_cast<long long>(windowEnd), currentSdfd,
                             minLimits, currentSdfd >= minLimits ? "OK" : "FAIL");
            if (currentSdfd >= minLimits) {
                continue;
            }

            if (stopOnFirstViolation && ShouldApplyOptimizerPaIgnore(periodHours) &&
                !HasRoAssignedRosterInRange(rosters, windowStart, windowEnd)) {
                Rule7501DebugLog(
                    "  skip winStart=%lld winEnd=%lld (optimizer: all pre-assigned in %d RH window)",
                    static_cast<long long>(windowStart), static_cast<long long>(windowEnd), periodHours);
                continue;
            }

            valid = false;
            if (worstSdfd != nullptr && currentSdfd < *worstSdfd) {
                *worstSdfd = currentSdfd;
                if (worstWindowStart != nullptr) {
                    *worstWindowStart = windowStart;
                }
                if (worstWindowEnd != nullptr) {
                    *worstWindowEnd = windowEnd;
                }
            }
            if (stopOnFirstViolation) {
                return false;
            }
        }
        return valid;
    }

}  // namespace

/** @copydoc LimitSingleDayFreeFromDutyForCARSRule::ParseParam */
void LimitSingleDayFreeFromDutyForCARSRule::ParseParam(const InputType& input) {
    _ruleParams.clear();
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(LimitSingleDayFreeFromDutyForCARSRuleParam(this));
        _ruleParams.back().ParseParam(dbRule);
    }

    if (!_ruleParams.empty()) {
        return;
    }
    for (const auto& singleRuleParamString : input.ruleParamString) {
        _ruleParams.emplace_back(LimitSingleDayFreeFromDutyForCARSRuleParam(this));
        _ruleParams.back().ParseParam(singleRuleParamString);
    }
}

/** @copydoc LimitSingleDayFreeFromDutyForCARSRule::CheckRule */
bool LimitSingleDayFreeFromDutyForCARSRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
    if (_ruleParams.empty() || rosters.empty()) {
        return true;
    }

    time_t checkedStartTime = 0;
    time_t checkedEndTime = 0;
    if (this->_application == ROSTER_OPTIMIZER) {
        checkedStartTime = this->_dbData->scenario.startDtUTC;
        checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
    } else {
        checkedStartTime = rosters[0]->actStrUtc;
        checkedStartTime -= checkedStartTime % 3600;
        checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
    }

    const SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters.front()->idcrew];
    const auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
    if (workPeriods.empty()) {
        return true;
    }

    bool passAllRule = true;
    for (const auto& ruleParam : _ruleParams) {
        if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
            continue;
        }
        _ruleViolation.SetRuleParam(ruleParam);
        if (!CheckRollingRequirement(ruleParam, workPeriods, rosters, checkedStartTime, checkedEndTime)) {
            passAllRule = false;
            if (!IsCheckAllRule()) {
                return false;
            }
        }
    }
    return passAllRule;
}

/** @copydoc LimitSingleDayFreeFromDutyForCARSRule::CheckRollingRequirement */
bool LimitSingleDayFreeFromDutyForCARSRule::CheckRollingRequirement(
    const LimitSingleDayFreeFromDutyForCARSRuleParam& ruleParam,
    const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
    const std::vector<const ROSTER*>& rosters,
    time_t checkedStartUtc,
    time_t checkedEndUtc) const {

    if (ruleParam._unit != "RH" || ruleParam._period <= 0 || ruleParam._minLimits <= 0) {
        Rule7501DebugLog("Skip rule param: unit=%s period=%d minLimits=%d (only RH is checked)",
                         ruleParam._unit.c_str(), ruleParam._period, ruleParam._minLimits);
        return true;
    }

    const time_t windowSeconds = static_cast<time_t>(ruleParam._period) * 3600;

    const time_t lastWorkEndUtc = workPeriods.back()->GetEndTimeUTC();
    const time_t trailingRestEndUtc = lastWorkEndUtc + windowSeconds;
    const time_t scanEndUtc = std::min(checkedEndUtc, trailingRestEndUtc);
    const time_t scanStartUtc = checkedStartUtc >= windowSeconds ? checkedStartUtc - windowSeconds : 0;
    if (scanStartUtc >= scanEndUtc) {
        return true;
    }

    const std::vector<RestSegment> trueRestPeriods =
        BuildTrueRestPeriods(workPeriods, ruleParam._dutyEndBufferMinutes, scanStartUtc, trailingRestEndUtc, this->_dbData);
    if (trueRestPeriods.empty()) {
        return true;
    }

    const std::vector<SdfdInterval> validSdfdList = BuildValidSdfdList(trueRestPeriods, workPeriods);

    Rule7501DebugLog(
        "CheckRollingRequirement unit=%s period=%d minLimits=%d checkedStart=%lld checkedEnd=%lld scanStart=%lld scanEnd=%lld workPeriods=%zu trueRest=%zu sdfdList=%zu",
        ruleParam._unit.c_str(), ruleParam._period, ruleParam._minLimits, static_cast<long long>(checkedStartUtc),
        static_cast<long long>(checkedEndUtc), static_cast<long long>(scanStartUtc), static_cast<long long>(scanEndUtc),
        workPeriods.size(), trueRestPeriods.size(), validSdfdList.size());
    for (size_t i = 0; i < validSdfdList.size(); ++i) {
        Rule7501DebugLog("  sdfd[%zu] start=[%lld,%lld] end=[%lld,%lld]", i,
                         static_cast<long long>(validSdfdList[i].startEarliestUtc),
                         static_cast<long long>(validSdfdList[i].startLatestUtc),
                         static_cast<long long>(validSdfdList[i].endEarliestUtc),
                         static_cast<long long>(validSdfdList[i].endLatestUtc));
    }

    int worstSdfd = INT_MAX;
    time_t worstWindowStart = 0;
    time_t worstWindowEnd = 0;

    const bool stopOnFirstViolation = this->_application == ROSTER_OPTIMIZER;
    const bool valid = CheckSweepRollingWindows(checkedStartUtc, scanEndUtc, windowSeconds, lastWorkEndUtc, ruleParam._minLimits, trueRestPeriods,
                        validSdfdList, workPeriods, ruleParam._period, rosters, &worstSdfd, &worstWindowStart, &worstWindowEnd,
                        stopOnFirstViolation);

    if (!valid) {
        Rule7501DebugLog("VIOLATION period=%d minLimits=%d worstSdfd=%d winStart=%lld winEnd=%lld",
                         ruleParam._period, ruleParam._minLimits, worstSdfd, static_cast<long long>(worstWindowStart),
                         static_cast<long long>(worstWindowEnd));
        ThrowRuleViolation(ruleParam, worstWindowStart, worstWindowEnd, worstSdfd);
        return false;
    }
    Rule7501DebugLog("PASS period=%d minLimits=%d", ruleParam._period, ruleParam._minLimits);
    return true;
}

/** @copydoc LimitSingleDayFreeFromDutyForCARSRule::ThrowRuleViolation */
void LimitSingleDayFreeFromDutyForCARSRule::ThrowRuleViolation(
    const LimitSingleDayFreeFromDutyForCARSRuleParam& ruleParam,
    time_t windowStartUtc,
    time_t windowEndUtc,
    int totalSdfd) const {
    std::string msg =
        "Single day free from duty (" + Utility::GetInstancePtr()->ToString(totalSdfd) +
        ") must be at least " + Utility::GetInstancePtr()->ToString(ruleParam._minLimits) + " in " +
        Utility::GetInstancePtr()->ToString(ruleParam._period) + " " + ruleParam._unit + ".";

    RULE_LEGALITY* pLeg = _ruleViolation.GetRuleLegality();
    SharedPtr<CREW> ppCrew = this->_dbData->crewList[pLeg->crewIndex];
    pLeg->legalMessage.push_back(msg);
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    pLeg->isLegal = false;
    pLeg->skipCheckInLaterIterations = true;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    rv->startDTUtc = windowStartUtc;
    rv->endDTUtc = windowEndUtc;
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    rv->operation_result.insert(std::pair<std::string, std::string>("period", std::to_string(ruleParam._period)));
    rv->operation_result.insert(std::pair<std::string, std::string>("unit", ruleParam._unit));
    rv->operation_result.insert(std::pair<std::string, std::string>("minLimits", std::to_string(ruleParam._minLimits)));
    rv->operation_result.insert(std::pair<std::string, std::string>("totalSingleDayFreeFromDuty", std::to_string(totalSdfd)));
    _ruleViolation.AddRuleViolations(rv);
}
