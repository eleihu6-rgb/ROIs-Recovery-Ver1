/**
 * @file CheckMinNumberOfDaysOffForPRRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#include "../RuleSytem.h"
#include "CheckMinNumberOfDaysOffForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"
#include "EnumerationDayOffPatternHelperParamCache.h"
#include "TimezoneUtils.h"

static void GenerateStatusUABackup(std::vector<std::vector<EnumerationOccupationStatus>>& statusVec,
	const std::vector<EnumerationOccupationStatus>& status,
	const std::vector<std::set<int>>& backupCopyVec,
	std::vector<int>& backupCopy, int index);


EnumerationDayOffPatternHelper<CheckMinNumberOfDaysOffForPRRule::DAY28> CheckMinNumberOfDaysOffForPRRule::helperDay28{};
EnumerationDayOffPatternHelper<CheckMinNumberOfDaysOffForPRRule::DAY29> CheckMinNumberOfDaysOffForPRRule::helperDay29{};
EnumerationDayOffPatternHelper<CheckMinNumberOfDaysOffForPRRule::DAY30> CheckMinNumberOfDaysOffForPRRule::helperDay30{};
EnumerationDayOffPatternHelper<CheckMinNumberOfDaysOffForPRRule::DAY31> CheckMinNumberOfDaysOffForPRRule::helperDay31{};
EnumerationDayOffPatternHelperCache<CheckMinNumberOfDaysOffForPRRule::DAY28> CheckMinNumberOfDaysOffForPRRule::helperCacheDay28{};
EnumerationDayOffPatternHelperCache<CheckMinNumberOfDaysOffForPRRule::DAY29> CheckMinNumberOfDaysOffForPRRule::helperCacheDay29{};
EnumerationDayOffPatternHelperCache<CheckMinNumberOfDaysOffForPRRule::DAY30> CheckMinNumberOfDaysOffForPRRule::helperCacheDay30{};
EnumerationDayOffPatternHelperCache<CheckMinNumberOfDaysOffForPRRule::DAY31> CheckMinNumberOfDaysOffForPRRule::helperCacheDay31{};

template<size_t NumBits>
static void SetHelperParam(std::vector<EnumerationOccupationStatus> slotStatus, EnumerationDayOffPatternHelper<NumBits>& helper, EnumerationCrewValue& crewValue, EnumerationDayOffPatternHelperCacheInfo& helperCacheInfo, EnumerationRuleParam* ruleParam, EnumerationDayOffPatternHelperParamCache cache, std::vector<unsigned char> pattern) {
	helper.SetPrintEnumerationResult(true);

	int totalNumDONeed = 0;
	for (const auto& num : pattern) {
		totalNumDONeed += (int)num;
	}

	ruleParam->defaultMaxConsecutiveDay = cache.maxConsecutiveTimes;
	ruleParam->previousRosterPeriodMaxConsecutiveDay = cache.maxConsecutiveTimes;
	ruleParam->minSpacingBetweenConsecutiveDOs = cache.minSpacingBetweenConsecutiveDOs;
	ruleParam->totalNumDONeeded = totalNumDONeed;
	ruleParam->permutation = true;
	if (cache.coveredWeekends) {
		ruleParam->doMustCoverDays = cache.weekendVector;
	}

	helperCacheInfo.ruleParam = ruleParam;
	helperCacheInfo.desiredPattern = pattern;
	helperCacheInfo.instanceId = cache.instanceId;

	//crewValue.previousConsecutiveDays = cache.maxConsecutiveTimes;
	crewValue.previousConsecutiveDays = cache.previousConsecutiveDays;
	crewValue.leadoutConsecutiveDays = cache.leadoutConsecutiveDays;
	crewValue.slotStatus = slotStatus;
}

bool CheckMinNumberOfDaysOffForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParamsMap.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	string zoneId = this->_dbData->airportZoneIdMap[base];
	time_t scenarioStart = RosterUtils::GetScenarioStartLoc(crew, this->_dbData);
	time_t scenarioEnd = RosterUtils::GetScenarioEndLoc(crew, this->_dbData);
	if (this->_application == ROSTER_OPTIMIZER)
	{
		auto& crewIdToDOParamCache = this->_dbData->GetDOParamCacheMap();
		if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end()) {
			CalDOParamCache(crew, scenarioStart, scenarioEnd);
			if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end()) {
				return false;
			}
		}
		const auto& cache = crewIdToDOParamCache.at(crew->idCrew);
		time_t rosterPeriodStart = scenarioStart;
		time_t rosterPeriodEnd = scenarioEnd + 24 * 3600 - 1;

		return this->CheckMinConsecutiveDaysOffByRosterPeriod(crew, rosterPeriodStart, rosterPeriodEnd, true, cache);

	}
	else
	{
		//根据live的开始结束日期，得到日期范围内的RP
		for (auto& rp : this->_dbData->rosterPeriodList) {
			if (rp.rp_end < scenarioStart || rp.rp_start > scenarioEnd)
				continue;
			bool isFullRP = false;//RP整个时间段是否在场景内
			if (rp.rp_start >= scenarioStart && rp.rp_end <= scenarioEnd) {
				isFullRP = true;
			}

			//计算RP周期
			time_t rosterPeriodStart = rp.rp_start;
			time_t rosterPeriodEnd = rp.rp_end + 24 * 3600 - 1;

			this->_dbData->clearDOParamCacheMap();
			this->CalDOParamCache(crew, rosterPeriodStart, rosterPeriodEnd);
			const auto& crewIdToDOParamCache = this->_dbData->GetDOParamCacheMap();
			if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end())
				continue;
			if (!isFullRP)
				continue;
			const auto& cache = crewIdToDOParamCache.at(crew->idCrew);
			if (cache.acceptDOs.empty() && cache.exceptDOs.empty())
				continue;
			if (!this->CheckMinConsecutiveDaysOffByRosterPeriod(crew, rosterPeriodStart, rosterPeriodEnd, isFullRP, cache)) {
				string msg = "There is no suitable DO pattern from ({0:start} - {1:end}).";
				msg = StringUtils::Format(msg, utcToUtcDtString(rp.rp_start), utcToUtcDtString(rp.rp_end));

				_ruleViolation.SetLegalityMessage(crew, msg);
				_ruleViolation.GetRuleLegality()->isLegal = false;
				_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				
				rv->startDTUtc = TimezoneUtils::GetUTCTime(rp.rp_start, zoneId);
				rv->endDTUtc = TimezoneUtils::GetUTCTime(rp.rp_end, zoneId);
				rv->idRule = cache.ruleId;
				rv->ruleParamId = cache.ruleParamId;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				_ruleViolation.AddRuleViolations(rv);
			}
		}
	}

	return passAllRule;
}

PatternResult CheckMinNumberOfDaysOffForPRRule::GetPatternResult(std::shared_ptr<CREW> crew, vector<const ROSTER*> rosterInRange, std::vector<EnumerationOccupationStatus>& statusVector, time_t checkStartLoc, time_t checkEndLoc, const bool isFullRP, const EnumerationDayOffPatternHelperParamCache cache, const bool isNeedGetAllResults, bool preCheck) const {
	std::vector<std::vector<unsigned char>> preferDOs;
	std::vector<std::string> restAssignmentGroupList;
	auto ruleParam = std::make_unique<EnumerationRuleParam>();
	EnumerationDayOffPatternHelperCacheInfo helperCacheInfo;
	EnumerationCrewValue crewValue;
	PatternResult results;
	if (this->_application == ROSTER_OPTIMIZER && !cache.legalPA) {
		return results;
	}
	if (rosterInRange.empty())
		return results;
	//RO二者之一，手动检查合并
	if (preCheck) {
		preferDOs = cache.acceptDOs;
	} else if (this->_application == ROSTER_OPTIMIZER) {
		preferDOs = cache.isExceptDO ? cache.exceptDOs : cache.acceptDOs;
	} else {
		preferDOs.reserve(cache.acceptDOs.size() + cache.exceptDOs.size());
		preferDOs.insert(preferDOs.end(), cache.acceptDOs.begin(), cache.acceptDOs.end());
		preferDOs.insert(preferDOs.end(), cache.exceptDOs.begin(), cache.exceptDOs.end());
	}
	// al天数
	int RDO_num = 0;
	int grey_num = 0;
	// 预占的u/a或grey天数
	int used_grey_num = 0;

	const auto& leadIn = cache.leadIn;
	const auto& leadOut = cache.leadOut;
	const auto& countBlankDay = cache.countBlankDay;
	bool prevRosterLeadOut = false;
	time_t prevRosterEndTime = 0;

	unsigned char spanRPConsecutiveDays{ 0 };
	std::map<std::string, int> uaGreyUsedMap{};

	int checkDays = TimeUtils::DiffCalendarDay(checkStartLoc, checkEndLoc);

	bool prevStartValid = true;
	statusVector = GetOccupationStatusByRoster(cache, checkDays, this->_dbData, crew, rosterInRange, checkStartLoc, checkEndLoc, prevRosterEndTime, restAssignmentGroupList, true, prevStartValid);
	if (!cache.countBlankDay) {
		for (size_t i = 0; i < checkDays; i++) {
			if (statusVector.at(i) == EnumerationOccupationStatus::DAYS_OFF_AVAILABLE) {
				statusVector.at(i) = EnumerationOccupationStatus::DUTY_OCCUPIED;
			}
		}
	}
	if (!prevStartValid) {
		if (this->_application == ROSTER_OPTIMIZER) {
			return results;
		}
	}

	for (const auto& pattern : preferDOs) {
		switch (checkDays)
		{
		case 28: {
			SetHelperParam<DAY28>(statusVector, helperDay28, crewValue, helperCacheInfo, ruleParam.get(), cache, pattern);
			auto patternsDay28 = helperDay28.GetAllPossiblePattern(helperCacheDay28, helperCacheInfo, crewValue);
			results.patternsDay28.insert(results.patternsDay28.end(), patternsDay28.begin(), patternsDay28.end());
			break;
		}
		case 29: {
			SetHelperParam<DAY29>(statusVector, helperDay29, crewValue, helperCacheInfo, ruleParam.get(), cache, pattern);
			auto patternsDay29 = helperDay29.GetAllPossiblePattern(helperCacheDay29, helperCacheInfo, crewValue);
			results.patternsDay29.insert(results.patternsDay29.end(), patternsDay29.begin(), patternsDay29.end());
			break;
		}
		case 30: {
			SetHelperParam<DAY30>(statusVector, helperDay30, crewValue, helperCacheInfo, ruleParam.get(), cache, pattern);
			auto patternsDay30 = helperDay30.GetAllPossiblePattern(helperCacheDay30, helperCacheInfo, crewValue);
			results.patternsDay30.insert(results.patternsDay30.end(), patternsDay30.begin(), patternsDay30.end());
			break;
		}
		case 31: {
			SetHelperParam<DAY31>(statusVector, helperDay31, crewValue, helperCacheInfo, ruleParam.get(), cache, pattern);
			auto patternsDay31 = helperDay31.GetAllPossiblePattern(helperCacheDay31, helperCacheInfo, crewValue);
			results.patternsDay31.insert(results.patternsDay31.end(), patternsDay31.begin(), patternsDay31.end());
			break;
		}
		default:
			break;
		}

		if (!isNeedGetAllResults && (!results.patternsDay28.empty() || !results.patternsDay29.empty() || !results.patternsDay30.empty() || !results.patternsDay31.empty())) {
			break;
		}

	}

	return results;
}

bool CheckMinNumberOfDaysOffForPRRule::CheckMinConsecutiveDaysOffByRosterPeriod(std::shared_ptr<CREW> crew, time_t checkStartLoc, time_t checkEndLoc, const bool isFullRP, const EnumerationDayOffPatternHelperParamCache cache, bool preCheck) const {
	const auto& rosterInRange = GetRosterInRange(crew->rosterList, checkStartLoc, checkEndLoc);
	if (rosterInRange.empty()) {
		return true;
	}
	int checkDays = TimeUtils::DiffCalendarDay(checkStartLoc, checkEndLoc);

	std::vector<EnumerationOccupationStatus> statusVector(checkDays, EnumerationOccupationStatus::DAYS_OFF_AVAILABLE);
	const auto& results = GetPatternResult(crew, rosterInRange, statusVector, checkStartLoc, checkEndLoc, isFullRP, cache, false, preCheck);
	if (!results.patternsDay28.empty() || !results.patternsDay29.empty() || !results.patternsDay30.empty() || !results.patternsDay31.empty()) {
		return true;
	}
	return false;
}
vector<const ROSTER*> CheckMinNumberOfDaysOffForPRRule::GetRosterInRange(const vector<SharedPtr<ROSTER>> rosters, time_t checkStartLoc, time_t checkEndLoc) const {
	vector<const ROSTER*> rosterInRange;
	// 统计AL数量
	for (std::size_t i = 0; i < rosters.size(); i++) {

		if ((rosters[i]->actStrLoc >= checkStartLoc && rosters[i]->actStrLoc < checkEndLoc) || (rosters[i]->actRestStrLoc >= checkStartLoc && rosters[i]->actRestStrLoc < checkEndLoc)) {
			rosterInRange.push_back(rosters[i].get());
		}
	}
	return rosterInRange;
}


std::vector<std::vector<EnumerationOccupationStatus>> CheckMinNumberOfDaysOffForPRRule::GetAvailableEnumerationOccupationStatus(const std::shared_ptr<CREW>& crew, const std::vector<const ROSTER*>& rosters) const {
	std::vector<std::vector<EnumerationOccupationStatus>> statusVectorVec;
	time_t windowStartLoc = RosterUtils::GetScenarioStartLoc(crew, this->_dbData);
	time_t windowEndLoc = RosterUtils::GetScenarioEndLoc(crew, this->_dbData);
	if (this->_application == ROSTER_OPTIMIZER)
	{
		auto& crewIdToDOParamCache = this->_dbData->GetDOParamCacheMap();
		if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end()) {
			CalDOParamCache(crew, windowStartLoc, windowEndLoc);
			if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end())
				return statusVectorVec;
		}
		const auto& cache = crewIdToDOParamCache.at(crew->idCrew);
		time_t rosterPeriodStart = windowStartLoc;
		time_t rosterPeriodEnd = windowEndLoc + 24 * 3600 - 1;

		int checkDays = TimeUtils::DiffCalendarDay(rosterPeriodStart, rosterPeriodEnd);

		std::vector<EnumerationOccupationStatus> statusVector(checkDays, EnumerationOccupationStatus::DAYS_OFF_AVAILABLE);

		const auto& rosterInRange = GetRosterInRange(crew->rosterList, rosterPeriodStart, rosterPeriodEnd);
		const auto& results = GetPatternResult(crew, rosterInRange, statusVector, rosterPeriodStart, rosterPeriodEnd, true, cache, true, false);

		if (results.patternsDay28.empty() && results.patternsDay29.empty() && results.patternsDay30.empty() && results.patternsDay31.empty()) {
			return statusVectorVec;
		}

		if (!results.patternsDay28.empty()) {
			for (const auto& solution : results.patternsDay28) {
				std::vector<EnumerationOccupationStatus> statusVectorTemp(statusVector);
				for (std::size_t i = 0; i < 28; i++) {
					if (solution.test(i)) {
						statusVectorTemp.at(i) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
					}
				}
				statusVectorVec.push_back(statusVectorTemp);
			}
		}
		if (!results.patternsDay29.empty()) {
			for (const auto& solution : results.patternsDay29) {
				std::vector<EnumerationOccupationStatus> statusVectorTemp(statusVector);
				for (std::size_t i = 0; i < 29; i++) {
					if (solution.test(i)) {
						statusVectorTemp.at(i) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
					}
				}
				statusVectorVec.push_back(statusVectorTemp);
			}
		}
		if (!results.patternsDay30.empty()) {
			for (const auto& solution : results.patternsDay30) {
				std::vector<EnumerationOccupationStatus> statusVectorTemp(statusVector);
				for (std::size_t i = 0; i < 30; i++) {
					if (solution.test(i)) {
						statusVectorTemp.at(i) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
					}
				}
				statusVectorVec.push_back(statusVectorTemp);
			}
		}
		if (!results.patternsDay31.empty()) {
			for (const auto& solution : results.patternsDay31) {
				std::vector<EnumerationOccupationStatus> statusVectorTemp(statusVector);
				for (std::size_t i = 0; i < 31; i++) {
					if (solution.test(i)) {
						statusVectorTemp.at(i) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
					}
				}
				statusVectorVec.push_back(statusVectorTemp);
			}
		}
	}

	return statusVectorVec;
}

void CheckMinNumberOfDaysOffForPRRule::CalDOParamCache(std::shared_ptr<CREW> crew, const time_t windowStartLoc, const time_t windowEndLoc) const {

	if (this->_dbData->GetDOParamCacheMap().find(crew->idCrew) != this->_dbData->GetDOParamCacheMap().end())
		return;

	time_t daySeconds = 3600 * 24;

	EnumerationDayOffPatternHelperParamCache cache;

	long leadIn = 0;
	long leadOut = 0;
	//al天数
	int al_num = 0;
	long minLength = 0;
	int DO_num = 0;
	int grey_num = 0;
	int max_grey_num = 0;
	// 预占的u/a或grey天数
	int used_grey_num = 0;
	string DO_main, preferred, notPreferred;
	vector<RosterPeriod> rosterPeriods;
	std::pair<std::vector<std::vector<unsigned char>>, std::vector<std::vector<unsigned char>>> rstDOPair;
	vector<vector<unsigned char>> acceptDOs;
	vector<vector<unsigned char>> exceptDOs;
	unsigned char maxContinueDONum = 0;
	string preferredDOsText = "2+2+2+2"; // 默认2,2,2,2组合
	string acceptDOsText;
	string exceptDOsText;
	vector<string> restAssignmentGroupList;
	vector<string> restAssignmentList;
	string strRestAssignmentGroup, strRestAssignment, strCoveredWeekends, strExcludingTeams = "*";
	// 计算RP周期
	time_t rosterPeriodStart = 0, rosterPeriodEnd = 0;
	time_t scenarioStart = windowStartLoc, scenarioEnd = windowEndLoc;

    rosterPeriodStart = scenarioStart;
    rosterPeriodEnd = scenarioEnd + 24 * 3600 - 1;

	bool prevRosterLeadOut = false;
	time_t prevRosterEndTime = 0;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<ROSTER>> rosterInRange;
	vector<string> alAssignments;
	string rdoAssignment, greyAssignment, unassignedAssignment, unassignedPatternStr;
	std::map<std::string, int> unassignedPatterns;
	//int minSpacingBetweenConsecutiveRDOs{ 0 };
	std::string minSpacingBetweenConsecutiveRDOs = "1";
	std::vector<std::string> minSpacingBetweenConsecutiveRDOsVec;
	std::vector<int> minSpacingBetweenConsecutiveRDOsIntVec;
	int minSpacing = INT_MAX;

	int day = TimeUtils::DiffCalendarDay(rosterPeriodStart, rosterPeriodEnd);

	for (int i = 0; i < day - 1;) {
		std::set<unsigned char> daySet;
		if (TimeUtils::IsWeekend(rosterPeriodStart + i * 3600 * 24)) {
			daySet.emplace((unsigned char)i);
			if (TimeUtils::IsWeekend(rosterPeriodStart + (i + 1) * 3600 * 24)) {
				daySet.emplace(i + 1);
				i++;
			}
			cache.weekendVector.emplace_back(daySet);
		}
		i++;
	}
	bool matchRule = false;
	for (const auto& ruleParamMap : _ruleParamsMap) {
		if (matchRule) break;
		const auto& ruleParam = ruleParamMap.second;
		bool firstMatch = false;
		for (const auto& first : ruleParam.GetFirstCaseParams()) {

            if (!first.MatchCrewQualification(crew, rosterPeriodStart, rosterPeriodEnd)) {
                continue;
            }

            if (!first.MatchDays(day)) {
                continue;
            }

            firstMatch = true;
            cache.leadIn = first._latestDebriefBeforeFirstDOHHmmMinutes;
            cache.leadOut = first._earliestBriefAfterLastDOHHmmMinutes;
            cache.DOAssignments = first._daysOffAssignments;
            cache.DOAssignmentGroups = first._daysOffAssignmentGroups;
            cache.alAssignments = first._leaveAssignments;
            cache.alAssignmentGroups = first._leaveAssignmentGroups;
            cache.countBlankDay = first._includeBlankDays;
            cache.minSpacingBetweenConsecutiveDOs = first._spacing;
            cache.maxConsecutiveTimes = first._maxConsecutiveWorkingDays;
            cache.coveredWeekends = first._coverdWeekends;
        }
		if (!firstMatch) continue;
		unsigned char spanRPConsecutiveDays{ 0 };
		std::vector<long long> alDays;
		// 统计AL数量
		for (std::size_t i = 0; i < rosters.size(); i++) {

			auto isAL = false;

			if (find(cache.alAssignments.begin(), cache.alAssignments.end(), rosters[i]->qualifier) != cache.alAssignments.end() || _dbData->isAssignmentInGroup(rosters[i]->qualifier, cache.alAssignmentGroups))
				isAL = true;

			if (isAL) {
				auto day = (rosters[i]->actStrLoc - rosterPeriodStart) / daySeconds;
				if (rosters[i]->actStrLoc < rosterPeriodStart &&
					(rosterPeriodStart - rosters[i]->actStrLoc) % daySeconds != 0)
					day--;
				alDays.emplace_back(day);
			}

			if (rosters[i]->actStrLoc >= rosterPeriodStart && rosters[i]->actStrLoc < rosterPeriodEnd) {
				if (isAL) {
					time_t alStartTime = rosters[i]->actStrLoc < rosterPeriodStart ? rosterPeriodStart : rosters[i]->actStrLoc;
					time_t alEndTime = rosters[i]->actRestStrLoc > rosterPeriodEnd ? rosterPeriodEnd : rosters[i]->actRestStrLoc;
					al_num += TimeUtils::DiffCalendarDay(alStartTime, alEndTime);
				}
				if (rosters[i]->actStrLoc < rosterPeriodEnd && rosters[i]->actRestStrLoc > rosterPeriodEnd
					&& (!_dbData->isAssignmentInGroup(rosters.at(i)->qualifier, cache.DOAssignmentGroups)
						&& find(cache.DOAssignments.begin(), cache.DOAssignments.end(), rosters[i]->qualifier) == cache.DOAssignments.end()))
					spanRPConsecutiveDays = static_cast<unsigned char>(TimeUtils::DiffCalendarDay(rosters[i]->actEndLoc, rosterPeriodEnd));
			}
		}
		cache.leadoutConsecutiveDays = spanRPConsecutiveDays;
        for (const auto& second : ruleParam.GetSecondCaseParams()) {
            if (second.MatchAlDays(al_num)) {
                ruleParam.GetPatternList(cache.acceptDOs, second._preferredDoPattern);
                ruleParam.GetPatternList(cache.exceptDOs, second._exceptionalDoPattern);
                cache.instanceId = stoll(to_string(ruleParam.GetId()) + to_string(second._rowNum));
                cache.ruleId = ruleParam.GetId();
                cache.ruleParamId = ruleParam.GetRuleParamId();
            	matchRule = true;
                break;
            }
            //没有匹配任何默认赋值第一条
            cache.ruleId = ruleParam.GetId();
        }

	}

	//没有匹配上任何table1，直接return
	if (!matchRule)
		return;



	//统计上一个RP到本RP开始前，连续工作了几天
	//因为除了RDO，都算工作天。所以找到上一个RDO截止的时间，计算到本RP开始，这段时间即可
	int numWorkDayPrevious = 0;
	if (!rosters.empty()) {
		for (int i = (int)rosters.size() - 1; i >= 0; i--) {
			auto& roster = rosters[i];
			// rosters从后往前时间排序，直接计算前一个RP的roster距当前RP的间隔天数
			// 若遇到前一个RP的RDO则break，则以首个RDO（结束时间）与当前RP的间隔天数统计为numWorkDayPrevious
			// 若前一个RP无预占RDO，则以前一个RP的最早的预占roster（开始时间）与当前RP的间隔时间统计为numWorkDayPrevious
			// 若前一个RP无预占，则默认为0
			if (roster->actStrLoc > rosterPeriodStart)
				continue;
			auto numWorkDayPreviousTemp = static_cast<int>((ceil)((double)(rosterPeriodStart - roster->actStrLoc) / (3600.0 * 24.0))); //ȡ����Ϊ������������

			if (roster->source != "PA") //预占违规不算违规
				numWorkDayPrevious = numWorkDayPreviousTemp;
			if (find(cache.DOAssignments.begin(), cache.DOAssignments.end(), rosters[i]->qualifier) != cache.DOAssignments.end() || _dbData->isAssignmentInGroup(rosters[i]->qualifier, cache.DOAssignmentGroups)) {
				auto numWorkDayPreviousTemp2 = static_cast<int>(rosterPeriodStart - roster->actEndLoc) / (3600 * 24); //ȡ����Ϊ������������
				if (roster->source != "PA") //预占违规不算违规
					numWorkDayPrevious = numWorkDayPreviousTemp2;
				break;
			}
		}
	}
	cache.previousConsecutiveDays = numWorkDayPrevious;

	this->_dbData->setDOParamCacheMap(crew->idCrew, cache);

}

std::vector<EnumerationOccupationStatus> CheckMinNumberOfDaysOffForPRRule::GetOccupationStatusByRoster(const EnumerationDayOffPatternHelperParamCache& ruleParam, int rangeDay, SharedPtr<CrewDataContext>& dbData, SharedPtr<CREW> crew, const std::vector<const ROSTER*>& rosters, time_t rangeStart, time_t rangeEnd, time_t prevRPRosterEndTime, const vector<string>& restAssignmentGroup, bool isSplit, bool& prevStartValid) const {
	std::vector<EnumerationOccupationStatus> status(rangeDay, EnumerationOccupationStatus::DUTY_OCCUPIED);

	int iSize = (int)rosters.size();
	time_t next_start;
	time_t actEnd = 0;
	std::vector<std::set<int>> backupCopyVec;
	long leadIn = ruleParam.leadIn * 60;
	long leadOut = ruleParam.leadOut * 60;


	// Tracking阶段，根据manday填充未加载的roster
	if (this->_application != ROSTER_OPTIMIZER) {
		time_t rosterStart = 0;
		time_t rosterEnd = 0;
		if (!rosters.empty()) {
			rosterStart = rosters[0]->getStartTimeLocAct();
			rosterEnd = rosters[rosters.size() - 1]->getEndTimeLocAct();
		}
		const auto& mandayfdList = crew->mandayFdList;
		if (!mandayfdList.empty()) {
			for (const auto& manday : mandayfdList) {
				if ((manday->IS_AL < 1) && (manday->DAY_OFF != DAY_OFF_EXIST)) continue;
				if (manday->dateLoc > rangeStart && manday->dateLoc <= rangeEnd) {
					if (rosterStart == 0 || rosterEnd == 0 || manday->dateLoc < rosterStart || manday->dateLoc > rosterEnd) {
						int day = static_cast<int>(manday->dateLoc - rangeStart) / (3600 * 24);
						if (day < rangeDay) {
							if (manday->IS_AL > 0)
								status.at(day) = EnumerationOccupationStatus::ANNUAL_LEAVE_OCCUPIED;
							if (manday->DAY_OFF == DAY_OFF_EXIST)
								status.at(day) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
						}
					}
				}
			}
		}
		const auto& mandayccList = crew->mandayCcAmList;
		if (!mandayccList.empty()) {
			for (const auto& manday : mandayccList) {
				if (!manday->IS_AL && (manday->DAY_OFF != DAY_OFF_EXIST)) continue;
				if (manday->dateLoc > rangeStart && manday->dateLoc <= rangeEnd) {
					if (rosterStart == 0 || rosterEnd == 0 || manday->dateLoc < rosterStart || manday->dateLoc > rosterEnd) {
						int day = static_cast<int>(manday->dateLoc - rangeStart) / (3600 * 24);
						if (day < rangeDay) {
							if (manday->IS_AL)
								status.at(day) = EnumerationOccupationStatus::ANNUAL_LEAVE_OCCUPIED;
							if ((manday->DAY_OFF == DAY_OFF_EXIST))
								status.at(day) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
						}
					}
				}
			}
		}
	}

	if (isSplit)
	{
		for (int i = 0; i < iSize; i++)
		{
			string roster_assignment = rosters[i]->qualifier;
			string next_roster_assignment;
			// 使用rest，则从roster的休息开始时间开始计算

			time_t end = rosters[i]->actRestStrLoc > actEnd ? rosters[i]->actRestStrLoc : actEnd;
			time_t start = rosters[i]->actStrLoc;
			actEnd = end;
			// 判断是否在RP周期内
			if (!(end > rangeStart || start < rangeEnd))
				continue;
			

			bool currentIsDO = false;
			if (!MatchDoAssignment(ruleParam, rosters[i])) {
				//前一个roster为已排RDO/SDO且与当前非休息roster相邻，则当前roster开始时间需要大于leadOut
				//否则直接违规，return
				if (i - 1 >= 0
					&& MatchDoAssignment(ruleParam, rosters[i - 1])
					&& start / (3600 * 24) - (rosters[i - 1]->actRestStrLoc / (3600 * 24) + 1) == 0
					&& start % (3600 * 24) < leadOut) {
					prevStartValid = false;
					if (this->_application != ROSTER_OPTIMIZER) {
						prevStartValid = false;
						string msg = "Duty cannot start earlier than ({0:leadOutHHmm}) subsequent to an DO.";
						msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(leadOut / 60));

						_ruleViolation.SetLegalityMessage(crew, msg);
						_ruleViolation.GetRuleLegality()->isLegal = false;
						_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->idRule = ruleParam.ruleId;
						rv->ruleParamId = ruleParam.ruleParamId;
						rv->crewId = crew->idCrew;
						rv->rosterId = rosters[i]->rosterId;
						rv->pairingId = rosters[i]->pairId;
						rv->startDTUtc = rosters[i]->actStrUtc;
						rv->endDTUtc = rosters[i]->actRestStrUtc;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
						_ruleViolation.AddRuleViolations(rv);
					}

				}
				//后一个roster为已排RDO/SDO且与当前非休息roster相邻，则当前roster结束时间需要小于leadIn
				//否则直接违规，return
				if (i + 1 < iSize
					&& MatchDoAssignment(ruleParam, rosters[i + 1])
					&& rosters[i + 1]->actStrLoc / (3600 * 24) - (end / (3600 * 24) + 1) == 0
					&& end % (3600 * 24) > leadIn) {
					if (this->_application != ROSTER_OPTIMIZER) {
						prevStartValid = false;
						string msg = "Duty cannot finish later than ({0:leadInHHmm}) prior to an DO.";
						msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(leadIn / 60));

						_ruleViolation.SetLegalityMessage(crew, msg);
						_ruleViolation.GetRuleLegality()->isLegal = false;
						_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->idRule = ruleParam.ruleId;
						rv->ruleParamId = ruleParam.ruleParamId;
						rv->crewId = crew->idCrew;
						rv->rosterId = rosters[i]->rosterId;
						rv->pairingId = rosters[i]->pairId;
						rv->startDTUtc = rosters[i]->actStrUtc;
						rv->endDTUtc = rosters[i]->actRestStrUtc;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
						_ruleViolation.AddRuleViolations(rv);
					}


				}
			}
			else {
				currentIsDO = true;
			}
			

			int day = static_cast<int>(start - rangeStart) / (3600 * 24);
			//避免status索引day越界保护
			if (day >= (int)status.size()) { day = (int)status.size() - 1; }
			if (day < 0) { day = 0; }

			// 预占RDO填入，hardcode: RDO, SDO, AL
			if (MatchDoAssignment(ruleParam, rosters[i])) {
				status.at(day) = EnumerationOccupationStatus::DAYS_OFF_OCCUPIED;
			}
			if (MatchLeaveAssignment(ruleParam, rosters[i])) {
				status.at(day) = EnumerationOccupationStatus::ANNUAL_LEAVE_OCCUPIED;
			}

			// RP开始到第一个Roster之间的空白天
			if (i == 0) {
				for (int j = 1; j < day - 1; j++) {
					if (rangeStart + j * 24 * 3600 > prevRPRosterEndTime)
						status.at(j) = EnumerationOccupationStatus::DAYS_OFF_AVAILABLE;
				}
				if (day > 0) {
					if (rangeStart - prevRPRosterEndTime >= 24 * 3600 - leadIn
						// 首个roster是休息无需判断leadOut和length
						// length只需要超过 一天+minLength 即可
						&& (start - rangeStart >= 24 * 3600 + leadOut
							)
						) {
						/*	RDO_Ranges range;
							range.startTime = rangeStart;
							range.endTime = (start / (3600 * 24)) * 3600 * 24;*/
						status.at(0) = EnumerationOccupationStatus::DAYS_OFF_AVAILABLE;
					}
				}
				if (day > 1 && rangeStart + (day - 1) * 24 * 3600 > prevRPRosterEndTime) {
					if (start - rangeStart >= day * 24 * 3600 + leadOut || currentIsDO) {
						status.at(day - 1) = EnumerationOccupationStatus::DAYS_OFF_AVAILABLE;
					}
				}
			}




			bool bFind = false;
			bool nextIsDO = true;
			// 如果后续有任务,则用后续任务的开始时间，没有的话则用RP的结束时间，并统计到RP结束时间可以安排几个RDO
			if (i + 1 < iSize) {
				next_start = rosters[i + 1]->actStrLoc;
				next_roster_assignment = rosters[i + 1]->qualifier;
				if (!MatchDoAssignment(ruleParam, rosters[i + 1]))
					nextIsDO = false;
			}
			else {
				next_start = rangeEnd + 1;
			}

			// 获取roster end的小时分钟数
			time_t endMin = end % (3600 * 24);
			time_t startMin = next_start % (3600 * 24);

			time_t length = next_start - end;
			// 求任务之间空白的天数
			time_t endDay = (end / (3600 * 24) + 1);
			time_t nextStartDay = (next_start / (3600 * 24));
			int days = static_cast<int>(nextStartDay - endDay);
			time_t rdoStart, rdoEnd;
			time_t rdoStartBackup = 0;
			time_t rdoEndBackup = 0;
			bool prevDayReduce = false;
			bool nextDayReduce = false;
			bool prevOrNextDayReduce = false;
			if (days < 1) {
				continue;
			}
			rdoStart = endDay * 3600 * 24;
			rdoEnd = nextStartDay * 3600 * 24;
			// 结束时间是否满足条件,rest roster 不考虑结束时间, 结束是RP也暂时不考虑
			bool endValid = (currentIsDO || endMin <= leadIn);
			// 开始时间是否满足条件
			bool startValid = nextIsDO || (startMin >= leadOut || next_start == rangeEnd);

			// 开始结束时间和长度满足RDO要求,或者结束时间是RP结束，则不用减天数
			if (endValid && startValid && next_start == rangeEnd) {
				rdoStart = endDay * 3600 * 24;
				rdoEnd = nextStartDay * 3600 * 24;
			}
			// 开始时间满足，长度不满足或者结束时间不满足，结束时间往前减一天
			// 如果开始结束时间都满足，但长度不满足，
			else if (days > 1 && endValid && !startValid) {
				rdoEnd = (nextStartDay - 1) * 3600 * 24;
				--days;
				nextDayReduce = true;
			}
			// 结束时间满足，长度不满足或者开始时间不满足，开始时间往后加一天
			else if (days > 1 && startValid && !endValid) {
				rdoStart = (endDay + 1) * 3600 * 24;
				--days;
				prevDayReduce = true;
			}
			// 结束时间满足，长度不满足，1、结束时间往前一天；2、开始时间往后一天
			else if (days > 1 && startValid && endValid) {
				rdoEndBackup = (nextStartDay - 1) * 3600 * 24;
				rdoStartBackup = (endDay + 1) * 3600 * 24;
				prevOrNextDayReduce = true;
			}
			else if (days > 2 && !startValid && !endValid) {
				rdoStart = (endDay + 1) * 3600 * 24;
				rdoEnd = (nextStartDay - 1) * 3600 * 24;
				days -= 2;
				nextDayReduce = true;
				prevDayReduce = true;
			}
			else if (days == 1 && startValid && endValid) {
				int dayNext = static_cast<int>(rdoStart - rangeStart) / (3600 * 24);
				status.at(dayNext) = EnumerationOccupationStatus::DAYS_OFF_AVAILABLE;
				days = 0;
			}
			else {
				continue;
			}


			// 填入bitset
			day = static_cast<int>(rdoStart - rangeStart) / (3600 * 24);
			for (int j = 0; j < days; j++) {
				status.at(day + j) = EnumerationOccupationStatus::DAYS_OFF_AVAILABLE;
			}
			/*if (prevOrNextDayReduce) {
				auto dayBackupStart = static_cast<int>(rdoStartBackup - rangeStart) / (3600 * 24);
				auto dayBackupEnd = static_cast<int>(rdoEndBackup - rangeStart) / (3600 * 24);
				std::set<int> backupCopy;
				if (dayBackupStart != 0) {
					backupCopy.emplace(dayBackupStart - 1);
				}
				if (dayBackupEnd != Helper6001::RosterPeriodLength)
					backupCopy.emplace(dayBackupEnd);
				backupCopyVec.emplace_back(backupCopy);
			}*/

		}
	}
	return status;
}

static void GenerateStatusUABackup(std::vector<std::vector<EnumerationOccupationStatus>>& statusVec,
	const std::vector<EnumerationOccupationStatus>& status,
	const std::vector<std::set<int>>& backupCopyVec,
	std::vector<int>& backupCopy, int index) {
	if (index == backupCopyVec.size()) {
		std::vector<EnumerationOccupationStatus> statusTemp(status);
		for (auto item : backupCopy) {
			statusTemp[item] = EnumerationOccupationStatus::DAYS_OFF_AVAILABLE;
		}
		statusVec.push_back(statusTemp);
		return;
	}

	for (int item : backupCopyVec[index]) {
		backupCopy.push_back(item);
		GenerateStatusUABackup(statusVec, status, backupCopyVec, backupCopy, index + 1);
		backupCopy.pop_back();
	}
}

bool CheckMinNumberOfDaysOffForPRRule::MatchDoAssignment(const EnumerationDayOffPatternHelperParamCache& ruleParam, const ROSTER* roster) const {
	if (!ruleParam.DOAssignments.empty() && find(ruleParam.DOAssignments.begin(), ruleParam.DOAssignments.end(), roster->qualifier) != ruleParam.DOAssignments.end())
		return true;

	if (!ruleParam.DOAssignmentGroups.empty() && this->_dbData->isAssignmentInGroup(roster->qualifier, ruleParam.DOAssignmentGroups))
		return true;

	return false;
}

bool CheckMinNumberOfDaysOffForPRRule::MatchLeaveAssignment(const EnumerationDayOffPatternHelperParamCache& ruleParam, const ROSTER* roster) const {
	if (!ruleParam.alAssignments.empty() && find(ruleParam.alAssignments.begin(), ruleParam.alAssignments.end(), roster->qualifier) != ruleParam.alAssignments.end())
		return true;

	if (!ruleParam.alAssignmentGroups.empty() && this->_dbData->isAssignmentInGroup(roster->qualifier, ruleParam.alAssignmentGroups))
		return true;

	return false;
}

void CheckMinNumberOfDaysOffForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {

		long long idRule = dbRule.idRule;

		if (_ruleParamsMap.find(idRule) == _ruleParamsMap.end()) {
			_ruleParamsMap.emplace(idRule, CheckMinNumberOfDaysOffForPRRuleParam(this));
			auto& newParam = _ruleParamsMap.at(idRule);
			newParam.ParseParam(dbRule);
		}
		else {
			auto& newParam = _ruleParamsMap.at(idRule);
			newParam.ParseParam(dbRule);
		}
	}

}

void CheckMinNumberOfDaysOffForPRRule::PreCalculateCache() const {
	if (this->_ruleParamsMap.empty() || this->_application != ROSTER_OPTIMIZER) {
		return;
	}
	const auto& crews = this->_dbData->crewList;
	for(const auto &crew:crews) {
		time_t scenarioStart = RosterUtils::GetScenarioStartLoc(crew, this->_dbData);
		time_t scenarioEnd = RosterUtils::GetScenarioEndLoc(crew, this->_dbData);
		auto &crewIdToDOParamCache = this->_dbData->GetDOParamCacheMap();
		if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end()) {
			CalDOParamCache(crew, scenarioStart, scenarioEnd);
			if (crewIdToDOParamCache.find(crew->idCrew) == crewIdToDOParamCache.end()) {
				continue;
			}
		}
		const auto &cache = crewIdToDOParamCache.at(crew->idCrew);
		time_t rosterPeriodStart = scenarioStart;
		time_t rosterPeriodEnd = scenarioEnd + 24 * 3600 - 1;
		auto legal =  this->CheckMinConsecutiveDaysOffByRosterPeriod(crew, rosterPeriodStart, rosterPeriodEnd, true, cache, true);
		if(!legal){
			auto cacheTemp = cache;
			cacheTemp.isExceptDO = true;
			this->_dbData->setDOParamCacheMap(crew->idCrew, cacheTemp);
		}
	}
}

