#include "AnrDayOffDefinition.h"

#include <algorithm>
#include <cstdlib>
#include <limits>

#include "Log/Logger.h"
#include "../framework/constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "StringUtil.h"
#include "RuleParams.h"
#include "UtilFunc.h"

namespace {
    const int kInfiniteSequenceUpper = std::numeric_limits<int>::max();
    constexpr long long kSecondsPerDay = 24LL * 60LL * 60LL;
}

AnrDayOffDefinition::AnrDayOffDefinition() {
    ensureDefaultRows();
}

void AnrDayOffDefinition::loadFromDbRules(const std::vector<DBRule>& dbRules) {
    _reqRows.clear();

    for (const auto& dbRule : dbRules) {
        // TableNum semantics (CSV/DB):
        // - Single-table rules may use tableNum==0 (tableHeader/tableRowX) or 1 (table1Header/table1RowX).
        // - Multi-table rules use tableNum==1/2 (or 0/2 for legacy CSV naming).
        if (dbRule.tableNum == 0 || dbRule.tableNum == 1) {
            parseReqRow(dbRule);
        }
        else if (dbRule.tableNum == 2) {
            parseReqExRow(dbRule);
        }
    }

    std::sort(_reqRows.begin(), _reqRows.end(), [](const Requirement& lhs,
                                             const Requirement& rhs) {
        if (lhs.sequenceLower != rhs.sequenceLower) {
            return lhs.sequenceLower < rhs.sequenceLower;
        }
        if (lhs.sequenceUpper != rhs.sequenceUpper) {
            return lhs.sequenceUpper < rhs.sequenceUpper;
        }
        return lhs.rowNum < rhs.rowNum;
    });
}

const AnrDayOffDefinition::Requirement*
AnrDayOffDefinition::findRequirementForSequence(int sequence) const {
    if (sequence <= 0) {
        return nullptr;
    }
    for (const auto& row : _reqRows) {
        if (row.matchesSequence(sequence)) {
            return &row;
        }
    }
    return nullptr;
}

int AnrDayOffDefinition::getRequiredRestMinutesForDayOffCount(
    int dayOffCount) const {
    if (dayOffCount <= 0) {
        return 0;
    }
    int total = 0;
    for (int seq = 1; seq <= dayOffCount; ++seq) {
        const auto* req = findRequirementForSequence(seq);
        if (req == nullptr) {
            return 0;
        }
        total += req->minRestMinutes;
    }
    return total;
}

int AnrDayOffDefinition::getRequiredLocalNightsForDayOffCount(
    int dayOffCount) const {
    if (dayOffCount <= 0) {
        return 0;
    }
    int total = 0;
    for (int seq = 1; seq <= dayOffCount; ++seq) {
        const auto* req = findRequirementForSequence(seq);
        if (req == nullptr) {
            return 0;
        }
        total += req->minLocalNights;
    }
    return total;
}

void AnrDayOffDefinition::parseReqRow(const DBRule& dbRule) {
    if (dbRule.params.empty()) {
        return;
    }

    Requirement req;
    req.idRule = dbRule.idRule;
    req.idRuleParam = dbRule.idRuleParam;
    req.rowNum = dbRule.rowNum;

    for (const auto& kv : dbRule.params) {
        const std::string header = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);
        if (header == "DAY OFF SEQUENCE") {
            parseSequenceRange(value, req.sequenceLower, req.sequenceUpper);
        } else if (header == "MIN REST TIME" || header == "MIN REST") {
            req.minRestMinutes = parseDurationToMinutes(value);
        } else if (header == "MIN LOCAL NIGHTS" ||
                   header == "MIN LOCAL NIGHT") {
            if (!value.empty() && value != RuleParamConstant::IGNORED) {
                if (isNumberStr(value.c_str(), value.size())) {
                    req.minLocalNights = atoi(value.c_str());
                } else {
                    Logger::getRuleLogger()->warn(
                        "Rule 7401 invalid MIN LOCAL NIGHTS value:{} idRule:{} "
                        "idRuleParam:{}",
                        value, dbRule.idRule, dbRule.idRuleParam);
                }
            }
        } else {
            // ignore unknown headers but log once for traceability
            Logger::getRuleLogger()->debug(
                "Rule 7401 ignoring param '{}' for idRule:{} idRuleParam:{}",
                header, dbRule.idRule, dbRule.idRuleParam);
        }
    }

    if (req.sequenceLower <= 0) {
        Logger::getRuleLogger()->warn(
            "Rule 7401 row missing DAY OFF SEQUENCE idRule:{} idRuleParam:{}",
            dbRule.idRule, dbRule.idRuleParam);
        return;
    }
    if (req.sequenceUpper < req.sequenceLower) {
        std::swap(req.sequenceLower, req.sequenceUpper);
    }

    if (req.minRestMinutes <= 0 && req.minLocalNights <= 0) {
        Logger::getRuleLogger()->warn(
            "Rule 7401 row missing rest/night requirements idRule:{} "
            "idRuleParam:{}",
            dbRule.idRule, dbRule.idRuleParam);
        return;
    }

    if (req.sequenceUpper == 0) {
        req.sequenceUpper = req.sequenceLower;
    }

    _reqRows.push_back(req);
}

void AnrDayOffDefinition::parseReqExRow(const DBRule& dbRule) {
    if (dbRule.params.empty()) {
        return;
    }

    RequirementEx reqEx;
    reqEx.idRule = dbRule.idRule;
    reqEx.idRuleParam = dbRule.idRuleParam;
    reqEx.rowNum = dbRule.rowNum;

    for (const auto& kv : dbRule.params) {
        const std::string header = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);

        if (header == "DO ASSIGNMENT GROUPS") {
            if (!value.empty() && value != RuleParamConstant::ALL) {
                split(value, '|', reqEx.doAssignmentGroups);
            }
        }
        else if (header == "DO EXTENSION ASSIGNMENT GROUPS") {
            if (!value.empty() && value != RuleParamConstant::ALL) {
                split(value, '|', reqEx.doExtensionAssignmentGroups);
            }
        }
        else if (header == "BLANK DAY COUNTED AS DO(Y/N)" || header == "BLANK DAY COUNTED AS DDO(Y/N)") {
            reqEx.isBlankDayCountedDO = (value == RuleParamConstant::ALL || value.empty()) ? true : (value == RuleParamConstant::YES);
        }
        else {
            // ignore unknown headers but log once for traceability
            Logger::getRuleLogger()->debug(
                "Rule 7401 table2 ignoring param '{}' for idRule:{} idRuleParam:{}",
                header, dbRule.idRule, dbRule.idRuleParam);
        }
    }
    this->_reqExRow = reqEx;
}

void AnrDayOffDefinition::ensureDefaultRows() {
    if (!_reqRows.empty()) {
        return;
    }

    Requirement first;
    first.sequenceLower = 1;
    first.sequenceUpper = 1;
    first.minRestMinutes = 34 * 60;
    first.minLocalNights = 1;

    Requirement additional;
    additional.sequenceLower = 2;
    additional.sequenceUpper = 99;
    additional.minRestMinutes = 24 * 60;
    additional.minLocalNights = 1;

    _reqRows.push_back(first);
    _reqRows.push_back(additional);
}

int AnrDayOffDefinition::parseDurationToMinutes(const std::string& value) {
    if (value.empty() || value == RuleParamConstant::IGNORED) {
        return 0;
    }
    if (value.find(':') != std::string::npos) {
        return TimeUtils::hhmmToMinutes(value);
    }
    if (isNumberStr(value.c_str(), value.size())) {
        return atoi(value.c_str()) * 60;
    }
    Logger::getRuleLogger()->warn(
        "Rule 7401 invalid duration value '{}', expected HH:MM or integer "
        "hours",
        value);
    return 0;
}

void AnrDayOffDefinition::parseSequenceRange(const std::string& value,
                                             int& lower,
                                             int& upper) {
    if (value.empty() || value == RuleParamConstant::IGNORED ||
        value == RuleParamConstant::ALL) {
        lower = 1;
        upper = kInfiniteSequenceUpper;
        return;
    }

    std::vector<std::string> parts;
    split(value.c_str(), '-', parts);
    auto parseBound = [](const std::string& text, int defaultValue) -> int {
        if (text.empty() || text == RuleParamConstant::IGNORED ||
            text == RuleParamConstant::ALL) {
            return defaultValue;
        }
        if (isNumberStr(text.c_str(), text.size())) {
            return atoi(text.c_str());
        }
        return defaultValue;
    };

    if (parts.empty()) {
        lower = parseBound(trim(value), 1);
        upper = lower;
    } else if (parts.size() == 1) {
        lower = parseBound(trim(parts[0]), 1);
        upper = lower;
    } else {
        lower = parseBound(trim(parts[0]), 1);
        upper = parseBound(trim(parts[1]), kInfiniteSequenceUpper);
    }

    if (lower <= 0) {
        lower = 1;
    }
    if (upper <= 0) {
        upper = kInfiniteSequenceUpper;
    }
    if (upper < lower) {
        std::swap(lower, upper);
    }
}

int AnrDayOffDefinition::countDaysOffInRest(time_t restStartUtc,
    time_t restEndUtc,
    int offsetMinutes,
    const std::string& zoneId) const {
    if (restEndUtc <= restStartUtc) {
        return 0;
    }

    int daysOff = 0;
    time_t cursor = restStartUtc;
    while (true) {
        const int sequence = daysOff + 1;
        const auto* req = findRequirementForSequence(sequence);
        if (req == nullptr || req->minRestMinutes < 0) {
            break;
        }

        if (cursor + static_cast<time_t>(req->minRestMinutes) * 60 > restEndUtc) {
            break;
        }

		auto minRestEndUtcByTimeAndLN = DutyUtils::GetRestEndTimeMeetingMinRestAndNumLocalNights(
			cursor, offsetMinutes, zoneId, req->minRestMinutes, req->minLocalNights);

        if (minRestEndUtcByTimeAndLN <= 0 || minRestEndUtcByTimeAndLN > restEndUtc) {
            break;
        }

        daysOff++;
        cursor = minRestEndUtcByTimeAndLN;
    }

    return daysOff;
}

vector<std::tuple<time_t, time_t>> AnrDayOffDefinition::getDaysOffInRest(time_t restStartUtc,
    time_t restEndUtc,
    int offsetMinutes,
    const std::string& zoneId) const {
	vector<std::tuple<time_t, time_t>> daysOffInRest;
	if (restEndUtc <= restStartUtc) {
		return daysOffInRest;
	}

	time_t cursor = restStartUtc;
	while (true) {
		const int sequence = daysOffInRest.size() + 1;
		const auto* req = findRequirementForSequence(sequence);
		if (req == nullptr || req->minRestMinutes < 0) {
			break;
		}

		if (cursor + static_cast<time_t>(req->minRestMinutes) * 60 > restEndUtc) {
			break;
		}

		auto minRestEndUtcByTimeAndLN = DutyUtils::GetRestEndTimeMeetingMinRestAndNumLocalNights(
			cursor, offsetMinutes, zoneId, req->minRestMinutes, req->minLocalNights);

		if (minRestEndUtcByTimeAndLN <= 0 || minRestEndUtcByTimeAndLN > restEndUtc) {
			break;
		}

		// 添加找到的DDO时间段到结果中
		daysOffInRest.push_back(std::make_tuple(cursor, minRestEndUtcByTimeAndLN));
		
		cursor = minRestEndUtcByTimeAndLN;
	}

	return daysOffInRest;
}

inline static int GetEndTimeGapInSec(const ROSTER* roster) {
    if (roster->pairing == nullptr) {
        return RosterUtils::GetEndTimeGapInSec(roster, "ACT");
    }
    return RosterUtils::GetEndTimeGapInSec(roster->pairing->getLastSegment(), "ACT");
}

//结合Manday来判断是否是真是空白天
inline static bool isBlankDay(const std::tuple<time_t, time_t>& blankDay, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap) {
    auto iter = crewMandayMap.find(std::get<0>(blankDay));
    if (iter == crewMandayMap.end()) {
        return true;
    }
    if (iter->second->isDomesticDo == DAY_OFF_NA) {
        return true;
    }
    return false;
}

vector<std::tuple<time_t, time_t>> AnrDayOffDefinition::getDaysOffPeriodsByRoster(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const shared_ptr<CrewDataContext>& dbData,
    const time_t startDtUTC, const time_t endDtUTC,
    const int offsetMinutes,
    const std::string& zoneId) const {

    //DDO的时间段,<开始时间(本地时区),结束时间(本地时区)>
    vector<std::tuple<time_t, time_t>> daysOffPeriods;

    bool isCountBlankDay = _reqExRow.isBlankDayCountedDO;

    vector<std::tuple<time_t, time_t>> daysOffsOfAssignment;//连续分配DDO的时间段(可能包含空白天)
    time_t firstDaysOffStartTimeUtc = -1, lastDaysOffEndTimeUtc = -1; //第一个DO开始时间,最后一个DO结束时间
    time_t restStartTimeUtc = -1, restEndTimeUtc = -1;//包含Rest和DO Extension Assignment的休息时间
    ROSTER* prevRoster = nullptr;

    for (size_t i = 0; i <= rosters.size(); i++) {
        ROSTER* currRoster = i >= rosters.size() ? nullptr : const_cast<ROSTER*>(rosters[i]);
        ROSTER* nextRoster = (i + 1) >= rosters.size() ? nullptr : const_cast<ROSTER*>(rosters[i + 1]);

        if (restStartTimeUtc == -1) {
            if (prevRoster == nullptr) {
                restStartTimeUtc = startDtUTC;
            }
            else {
                restStartTimeUtc = _reqExRow.isDoExtensionAssignment(prevRoster->qualifier, dbData) ? prevRoster->getStartTimeUtcAct() : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
                restStartTimeUtc = std::max(restStartTimeUtc, startDtUTC - DO_FORWARD_EXT_DURATION);//restStartTimeUtc最多向前延伸1天
            }
        }

        if (isCountBlankDay) {
            //获得二者之间的空白天数
            time_t prevRestStartTimeUtc = prevRoster == nullptr ? startDtUTC : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
            prevRestStartTimeUtc = std::max(prevRestStartTimeUtc, startDtUTC);//DDO本体必须在周期内
            //prevRestStartTimeUtc = std::min(prevRestStartTimeUtc, restStartTimeUtc);
            //当currRoster == nullptr 则后续没有任务，结束时间为scenario结束时间
            time_t checkRestEndTimeUtc = currRoster == nullptr ? endDtUTC : currRoster->getStartTimeUtcAct();
            if (currRoster != nullptr && currRoster->getStartTimeUtcAct() > endDtUTC) {
                checkRestEndTimeUtc = std::min(currRoster->getStartTimeUtcAct(), endDtUTC);
            }
            auto blankDays = TimeUtils::GetFullDaysBetweenTimes(prevRestStartTimeUtc, checkRestEndTimeUtc, offsetMinutes);
            for (auto& blankDay : blankDays) {
                if (isBlankDay(blankDay, crewMandayMap)) {
                    daysOffsOfAssignment.emplace_back(blankDay);
                }
            }
            
        }

        if (currRoster == nullptr) {
            restEndTimeUtc = endDtUTC; //后续没有任务，结束时间为scenario结束时间
        }
        else if (currRoster->getStartTimeUtcAct() < endDtUTC && _reqExRow.isDoAssignment(currRoster->qualifier, dbData)) {
            if (firstDaysOffStartTimeUtc < 0) {
                firstDaysOffStartTimeUtc = currRoster->getStartTimeUtcAct();
            }
            lastDaysOffEndTimeUtc = currRoster->getEndTimeUtcAct();
            daysOffsOfAssignment.emplace_back(currRoster->getStartTimeUtcAct(), currRoster->getEndTimeUtcAct());
        }
        else if (_reqExRow.isDoExtensionAssignment(currRoster->qualifier, dbData)) {
            restEndTimeUtc = currRoster->getRestStartUtcAct() + GetEndTimeGapInSec(currRoster);
        }
        else {
            restEndTimeUtc = std::min(currRoster->getStartTimeUtcAct(), endDtUTC);
        }

        //下一个Roster不存在或超过检查范围，设置restEndTimeUtc
        if (restEndTimeUtc < 0) {
            if (nextRoster == nullptr) {
                restEndTimeUtc = endDtUTC;
            }
            else {
                //nextRoster是休息，则最后一天休息可以向后延申
                if (RuleParams::GetInstancePtr()->isRestAssignment(nextRoster->qualifier, nextRoster->duty)) {
                    restEndTimeUtc = nextRoster->getEndTimeUtcAct();
                }
                else {
                    restEndTimeUtc = nextRoster->getStartTimeUtcAct();
                }
            }
        }

        if (restEndTimeUtc > restStartTimeUtc) {
            if (!isCountBlankDay) {
                //空白天不能作为DO，此时restStartTimeUtc、restEndTimeUtc最多向前和向后延伸1天
                restStartTimeUtc = std::max(firstDaysOffStartTimeUtc - DO_FORWARD_EXT_DURATION, restStartTimeUtc);
                //restEndTimeUtc = std::min(lastDaysOffEndTimeUtc + 60 + DO_BACKWARD_EXT_DURATION, restEndTimeUtc);//DO结束实际23:59，因此需要增加60秒
                restEndTimeUtc = std::max(lastDaysOffEndTimeUtc + 60 + DO_BACKWARD_EXT_DURATION, restEndTimeUtc);//DO结束实际23:59，因此需要增加60秒
            }

            //累计[restStartTimeUtc,restEndTimeUtc]之间的满足DDO定义的时间段
            auto daysOffOfDefineInRest = this->getDaysOffInRest(restStartTimeUtc, restEndTimeUtc, offsetMinutes);

            //daysOffInRestOfDefine和dayOffs交集的时间段，添加到actDaysOff中
            bool firstDdo = true;
            for (auto& daysOffOfDefine : daysOffOfDefineInRest) {
                auto ddoDefineStartLoc = std::get<0>(daysOffOfDefine) + (time_t)offsetMinutes * 60;
                auto ddoDefineEndLoc = std::get<1>(daysOffOfDefine) + (time_t)offsetMinutes * 60;
                for (auto& dayOffOfAssignment : daysOffsOfAssignment) {
                    auto ddoAssignmentStartLoc = std::get<0>(dayOffOfAssignment) + (time_t)offsetMinutes * 60;
                    auto ddoAssignmentEndLoc = std::get<1>(dayOffOfAssignment) + (time_t)offsetMinutes * 60;
                    //计算分配DDO Assignment(可能包括空白天)时间段[ddoAssignmentStartLoc,ddoAssignmentEndLoc]与DDO定义时间段[ddoDefineStartLoc,ddoDefineEndLoc]重叠时长
                    time_t overlapDuration = std::min(ddoAssignmentEndLoc, ddoDefineEndLoc) - std::max(ddoAssignmentStartLoc, ddoDefineStartLoc);
                    if (overlapDuration >= (time_t)12 * 60 * 60) {//重叠时长大于等于12小时
                        daysOffPeriods.emplace_back(ddoDefineStartLoc, ddoDefineEndLoc);
                        if (firstDdo) {
                            firstDdo = false;
                        }
                        break;
                    }

                    // //判断分配DDO Assignment(可能包括空白天)时间段[ddoAssignmentStartLoc,ddoAssignmentEndLoc]需要在DDO定义时间段[ddoDefineStartLoc,ddoDefineEndLoc]内	
                    // if (ddoAssignmentStartLoc >= ddoDefineStartLoc && ddoAssignmentEndLoc <= ddoDefineEndLoc) {
                    // 	actDaysOffsInManday.emplace_back(ddoAssignmentStartLoc, ddoAssignmentEndLoc);
                    // 	break;
                    // }
                }

            }
        }

        if (restEndTimeUtc >= 0) {
            daysOffsOfAssignment.clear();
            restStartTimeUtc = -1;
            restEndTimeUtc = -1;
            firstDaysOffStartTimeUtc = -1;
            lastDaysOffEndTimeUtc = -1;
        }

        prevRoster = currRoster;
    }
    return daysOffPeriods;
}

vector<std::tuple<time_t, time_t>> AnrDayOffDefinition::getPreConsecutiveDaysOffPeriods(const std::vector<const ROSTER*>& rosters, const int startIndex, const shared_ptr<CrewDataContext>& dbData,
    const time_t startDtUTC, const time_t endDtUTC, const int offsetMinutes, const std::string& zoneId) const {
    //DDO的时间段,<开始时间(本地时区),结束时间(本地时区)>
    vector<std::tuple<time_t, time_t>> daysOffPeriods;

    bool isCountBlankDay = _reqExRow.isBlankDayCountedDO;

    vector<std::tuple<time_t, time_t>> daysOffsOfAssignment;//连续分配DDO的时间段(可能包含空白天)
    time_t restStartTimeUtc = -1, restEndTimeUtc = -1;//包含Rest和DO Extension Assignment的休息时间

    for (int i = startIndex; i >= 0; i--) {
        ROSTER* currRoster = (i < 0 || i >= rosters.size()) ? nullptr : const_cast<ROSTER*>(rosters[i]);
        ROSTER* prevRoster = (i <= 0) ? nullptr : const_cast<ROSTER*>(rosters[(size_t)i - 1]);

        if (restEndTimeUtc == -1) {
            restEndTimeUtc = currRoster->getStartTimeUtcAct();
        }
        if (isCountBlankDay) {
            //获得二者之间的空白天数
            time_t checkRestStartTimeUtc = prevRoster == nullptr ? startDtUTC : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
            time_t checkRestEndTimeUtc = currRoster->getStartTimeUtcAct();
            auto blankDays = TimeUtils::GetFullDaysBetweenTimes(checkRestStartTimeUtc, checkRestEndTimeUtc, offsetMinutes);
            for (auto& blankDay : blankDays) {
                daysOffsOfAssignment.emplace_back(blankDay);
            }
        }

        if (prevRoster == nullptr) {
            restStartTimeUtc = startDtUTC; //前序没有任务，休息开始时间为scenario开始时间
        }
        else if (_reqExRow.isDoAssignment(prevRoster->qualifier, dbData)) {
            daysOffsOfAssignment.emplace_back(prevRoster->getStartTimeUtcAct(), prevRoster->getEndTimeUtcAct());
        }
        else if (_reqExRow.isDoExtensionAssignment(prevRoster->qualifier, dbData)) {
            restStartTimeUtc = prevRoster->getStartTimeUtcAct();
        }
        else if (_reqExRow.isWorkAssignment(prevRoster->qualifier, dbData)) {
            restStartTimeUtc = prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(currRoster);
        }

        if (restStartTimeUtc < 0 || restEndTimeUtc < 0) {
            continue;
		}
        //累计[restStartTimeUtc,restEndTimeUtc]之间的满足DDO定义的时间段
        auto daysOffOfDefineInRest = this->getDaysOffInRest(restStartTimeUtc, restEndTimeUtc, offsetMinutes);

        //daysOffInRestOfDefine和dayOffs交集的时间段，添加到actDaysOff中
        for (auto& daysOffOfDefine : daysOffOfDefineInRest) {
            auto ddoDefineStartLoc = std::get<0>(daysOffOfDefine) + (time_t)offsetMinutes * 60;
            auto ddoDefineEndLoc = std::get<1>(daysOffOfDefine) + (time_t)offsetMinutes * 60;
            for (auto& dayOffOfAssignment : daysOffsOfAssignment) {
                auto ddoAssignmentStartLoc = std::get<0>(dayOffOfAssignment) + (time_t)offsetMinutes * 60;
                auto ddoAssignmentEndLoc = std::get<1>(dayOffOfAssignment) + (time_t)offsetMinutes * 60;
                //计算分配DDO Assignment(可能包括空白天)时间段[ddoAssignmentStartLoc,ddoAssignmentEndLoc]与DDO定义时间段[ddoDefineStartLoc,ddoDefineEndLoc]重叠时长
                time_t overlapDuration = std::min(ddoAssignmentEndLoc, ddoDefineEndLoc) - std::max(ddoAssignmentStartLoc, ddoDefineStartLoc);
                if (overlapDuration >= (time_t)12 * 60 * 60) {//重叠时长大于等于12小时
                    daysOffPeriods.emplace_back(ddoDefineStartLoc, ddoDefineEndLoc);
                    break;
                }
            }
        }
        break;
    }
    return daysOffPeriods;
}

vector<std::tuple<time_t, time_t>> AnrDayOffDefinition::getPostConsecutiveDaysOffPeriods(const std::vector<const ROSTER*>& rosters, const int endIndex, const shared_ptr<CrewDataContext>& dbData,
    const time_t startDtUTC, const time_t endDtUTC,
    const int offsetMinutes, const std::string& zoneId) const {

    //DDO的时间段,<开始时间(本地时区),结束时间(本地时区)>
    vector<std::tuple<time_t, time_t>> daysOffPeriods;

    bool isCountBlankDay = _reqExRow.isBlankDayCountedDO;

    vector<std::tuple<time_t, time_t>> daysOffsOfAssignment;//连续分配DDO的时间段(可能包含空白天)
    time_t restStartTimeUtc = -1, restEndTimeUtc = -1;//包含Rest和DO Extension Assignment的休息时间

    for (int i = endIndex; i < rosters.size(); i++) {
        ROSTER* currRoster = const_cast<ROSTER*>(rosters[i]);
        ROSTER* nextRoster = (i + 1) >= (int)rosters.size() ? nullptr : const_cast<ROSTER*>(rosters[(size_t)i + 1]);

        if (restStartTimeUtc == -1) {
            restStartTimeUtc = currRoster->getRestStartUtcAct() + GetEndTimeGapInSec(currRoster);
        }
        if (isCountBlankDay) {
            //获得二者之间的空白天数
            time_t checkRestStartTimeUtc = currRoster->getRestStartUtcAct() + GetEndTimeGapInSec(currRoster);
            time_t checkRestEndTimeUtc = (nextRoster == nullptr) ? endDtUTC : nextRoster->getStartTimeUtcAct();
            auto blankDays = TimeUtils::GetFullDaysBetweenTimes(checkRestStartTimeUtc, checkRestEndTimeUtc, offsetMinutes);
            for (auto& blankDay : blankDays) {
                daysOffsOfAssignment.emplace_back(blankDay);
            }
        }

        if (nextRoster == nullptr) {
            restEndTimeUtc = endDtUTC; //后序没有任务，休息结束时间为scenario结束时间
        }
        else if (_reqExRow.isDoAssignment(nextRoster->qualifier, dbData)) {
            daysOffsOfAssignment.emplace_back(nextRoster->getStartTimeUtcAct(), nextRoster->getEndTimeUtcAct());
        }
        else if (_reqExRow.isDoExtensionAssignment(nextRoster->qualifier, dbData)) {
            restEndTimeUtc = nextRoster->getEndTimeUtcAct();
        }
        else if (_reqExRow.isWorkAssignment(nextRoster->qualifier, dbData)) {
            restEndTimeUtc = nextRoster->getStartTimeUtcAct();
        }

        if (restStartTimeUtc < 0 || restEndTimeUtc < 0) {
            continue;
        }
        //累计[restStartTimeUtc,restEndTimeUtc]之间的满足DDO定义的时间段
        auto daysOffOfDefineInRest = this->getDaysOffInRest(restStartTimeUtc, restEndTimeUtc, offsetMinutes);

        //daysOffInRestOfDefine和dayOffs交集的时间段，添加到actDaysOff中
        for (auto& daysOffOfDefine : daysOffOfDefineInRest) {
            auto ddoDefineStartLoc = std::get<0>(daysOffOfDefine) + (time_t)offsetMinutes * 60;
            auto ddoDefineEndLoc = std::get<1>(daysOffOfDefine) + (time_t)offsetMinutes * 60;
            for (auto& dayOffOfAssignment : daysOffsOfAssignment) {
                auto ddoAssignmentStartLoc = std::get<0>(dayOffOfAssignment) + (time_t)offsetMinutes * 60;
                auto ddoAssignmentEndLoc = std::get<1>(dayOffOfAssignment) + (time_t)offsetMinutes * 60;
                //计算分配DDO Assignment(可能包括空白天)时间段[ddoAssignmentStartLoc,ddoAssignmentEndLoc]与DDO定义时间段[ddoDefineStartLoc,ddoDefineEndLoc]重叠时长
                time_t overlapDuration = std::min(ddoAssignmentEndLoc, ddoDefineEndLoc) - std::max(ddoAssignmentStartLoc, ddoDefineStartLoc);
                if (overlapDuration >= (time_t)12 * 60 * 60) {//重叠时长大于等于12小时
                    daysOffPeriods.emplace_back(ddoDefineStartLoc, ddoDefineEndLoc);
                    break;
                }
            }
        }
        break;
    }
    return daysOffPeriods;
}

vector<time_t> AnrDayOffDefinition::getDaysOffDates(const vector<std::tuple<time_t, time_t>>& daysOffPeriods) const {
    std::vector<time_t> result;

    // 空输入直接返回
    if (daysOffPeriods.empty()) {
        return result;
    }

    // 遍历所有DDO时间段（不管是否连续，每个独立计算所属日期）
    for (const auto& period : daysOffPeriods) {
        time_t start = std::get<0>(period);
        time_t end = std::get<1>(period);

        // 转为【本地时区】当天0点
        time_t ddo_date = this->getDaysOffDate(start, end);

        result.push_back(ddo_date);
    }

    return result;
}

time_t AnrDayOffDefinition::getDaysOffDate(const time_t ddoStart, const time_t ddoEnd) const {
    // 取中间时间 → 一定落在该DDO的完整自然日内
    time_t mid_time = ddoStart + (ddoEnd - ddoStart) / 2;

    // 转为【本地时区】当天0点
    time_t ddo_date = Utility::GetInstancePtr()->getLocalDayStartInUTC(mid_time, 0);
    return ddo_date;
}