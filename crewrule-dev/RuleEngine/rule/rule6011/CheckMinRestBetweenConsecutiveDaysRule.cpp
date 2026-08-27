/**
 * @file CheckMinRestBetweenConsecutiveDaysRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinRestBetweenConsecutiveDaysRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool CheckMinRestBetweenConsecutiveDaysRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
    const auto& rules6001 = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(ruleParam);
        if (!rules6001.empty() && ruleParam._blankDaysCount == "N" && this->IsRosterOptimizerModel()) continue;

		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;

		time_t firstBeforeStart = 0;
		const ROSTER* prevRoster = NULL;
		size_t lastBeforeRosterIndex = 0;
		for (size_t i = 0; i < rosters.size(); i++) {
			
			//判断任务类型
			if (ruleParam.MatchBeforeParam(rosters[i])) {
				if (firstBeforeStart == 0) {
					firstBeforeStart = rosters[i]->getStartTimeLocAct();
				}
				if (prevRoster && !RosterUtils::IsConsecutiveLocalDayByRestStart(prevRoster, rosters[i])) {
					// 打破连续状态，判断连续天数是否满足
					const auto& lastBeforeEnd = prevRoster->getRestStartLocAct();
					const auto& iCosecutive = TimeUtils::DiffCalendarDay(firstBeforeStart, lastBeforeEnd);
					if (iCosecutive >= ruleParam._consecutiveDaysBeforeRest) {
						time_t firstAfterStart = 0;
						const ROSTER* prevAfterRoster = NULL;
						// 记录连续after任务的首个任务index
						size_t firstAfterRosterIndex = 0;
						// 从上一个满足before条件的roster后，开始检查是否有满足after的连续任务
						for (size_t j = lastBeforeRosterIndex + 1; j < rosters.size(); j++) {
							if (ruleParam.MatchAfterParam(rosters[j])) {
								if (firstAfterStart == 0) {
									firstAfterStart = rosters[j]->getStartTimeLocAct();
								}
								if (firstAfterRosterIndex == 0) {
									firstAfterRosterIndex = j;
								}
								if (prevAfterRoster && (!RosterUtils::IsConsecutiveLocalDayByRestStart(prevAfterRoster, rosters[j]) || j == rosters.size() - 1)) {
									auto lastAfterEnd = prevAfterRoster->getRestStartLocAct();
									if (j == rosters.size() - 1) {
										lastAfterEnd = rosters[j]->getRestStartLocAct();
									}
									const auto& iAfterConsecutive = TimeUtils::DiffCalendarDay(firstAfterStart, lastAfterEnd);
									if (iAfterConsecutive >= ruleParam._consecutiveDaysAfterRest) {
										// 判断两个连续任务之间的休息时长
										const auto& days = GetDaysBetweenRosters(rosters, lastBeforeRosterIndex, firstAfterRosterIndex, ruleParam);

										if (days < ruleParam._minRestDays) {
											const auto& startTime = rosters[lastBeforeRosterIndex]->getEndTimeUtcAct();
											const auto& endTime = rosters[firstAfterRosterIndex]->getStartTimeUtcAct();
											_ruleViolation.SetParam("start", to_string(startTime));
											_ruleViolation.SetParam("end", to_string(endTime));
											_ruleViolation.SetParam("beforeConnDays", to_string(iCosecutive));
											_ruleViolation.SetParam("afterConnDays", to_string(iAfterConsecutive));
											_ruleViolation.SetParam("beforeAssignments", joinStrList(ruleParam._assignmentsBeforeRest, "|"));
											_ruleViolation.SetParam("beforeAssignmentGroups", joinStrList(ruleParam._assignmentGroupsBeforeRest, "|"));
											_ruleViolation.SetParam("afterAssignments", joinStrList(ruleParam._assignmentsAfterRest, "|"));
											_ruleViolation.SetParam("afterAssignmentGroups", joinStrList(ruleParam._assignmentGroupsAfterRest, "|"));
											_ruleViolation.SetParam("restAssignments", joinStrList(ruleParam._restAssignments, "|"));
											_ruleViolation.SetParam("restAssignmentGroups", joinStrList(ruleParam._restAssignmentGroups, "|"));
											_ruleViolation.SetParam("minRestDays", to_string(ruleParam._minRestDays));
											_ruleViolation.SetParam("crew_id", crew->idCrew);

											ThrowRuleViolation();
										}
									}
                                    firstAfterStart = rosters[j]->getStartTimeLocAct();
                                    firstAfterRosterIndex = j;
								}
								prevAfterRoster = rosters[j];
							}
                            else if(j + 1 == rosters.size() && prevAfterRoster){
                                auto lastAfterEnd = prevAfterRoster->getRestStartLocAct();
                                const auto& iAfterConsecutive = TimeUtils::DiffCalendarDay(firstAfterStart, lastAfterEnd);
                                if (iAfterConsecutive >= ruleParam._consecutiveDaysAfterRest) {
                                    auto days = GetDaysBetweenRosters(rosters, lastBeforeRosterIndex, firstAfterRosterIndex, ruleParam);

                                    if (days < ruleParam._minRestDays) {
                                        const auto& startTime = rosters[lastBeforeRosterIndex]->getEndTimeUtcAct();
                                        const auto& endTime = rosters[firstAfterRosterIndex]->getStartTimeUtcAct();
                                        _ruleViolation.SetParam("start", to_string(startTime));
                                        _ruleViolation.SetParam("end", to_string(endTime));
                                        _ruleViolation.SetParam("beforeConnDays", to_string(iCosecutive));
                                        _ruleViolation.SetParam("afterConnDays", to_string(iAfterConsecutive));
                                        _ruleViolation.SetParam("beforeAssignments", joinStrList(ruleParam._assignmentsBeforeRest, "|"));
                                        _ruleViolation.SetParam("beforeAssignmentGroups", joinStrList(ruleParam._assignmentGroupsBeforeRest, "|"));
                                        _ruleViolation.SetParam("afterAssignments", joinStrList(ruleParam._assignmentsAfterRest, "|"));
                                        _ruleViolation.SetParam("afterAssignmentGroups", joinStrList(ruleParam._assignmentGroupsAfterRest, "|"));
                                        _ruleViolation.SetParam("restAssignments", joinStrList(ruleParam._restAssignments, "|"));
                                        _ruleViolation.SetParam("restAssignmentGroups", joinStrList(ruleParam._restAssignmentGroups, "|"));
                                        _ruleViolation.SetParam("minRestDays", to_string(ruleParam._minRestDays));
                                        _ruleViolation.SetParam("crew_id", crew->idCrew);

                                        ThrowRuleViolation();
                                    }
                                }
                            }
						}
					}
                    firstBeforeStart = rosters[i]->getStartTimeLocAct();
				}
				prevRoster = rosters[i];
				lastBeforeRosterIndex = i;
			}
		}
		
	}
	return passAllRule;
}

int CheckMinRestBetweenConsecutiveDaysRule::GetDaysBetweenRosters(const std::vector<const ROSTER*>& rosters, const size_t startIndex, const size_t endIndex, const CheckMinRestBetweenConsecutiveDaysRuleParam ruleParam) const {
	const auto& startTime = rosters[startIndex]->getRestStartLocAct();
	const auto& endTime = rosters[endIndex]->getStartTimeLocAct();

	//前后任务，直接判断中间天数
	if (endIndex == startIndex + 1) {
		// 如果不计算空白天，直接返回0
		if (ruleParam._blankDaysCount == "N")
			return 0;
		else {
			return TimeUtils::CalculateFullDaysBetweenTimes(startTime, endTime);
		}
	}

	int days = 0;
	size_t lastIndex = startIndex;
	//存储空闲时间段
	map<time_t, time_t> restMap;
	time_t start = startTime;
	for (size_t i = startIndex + 1; i < endIndex; i++) {
		if (ruleParam._blankDaysCount == "N") {
			if (ruleParam.MatchRestParam(rosters[i])) {
				restMap.insert(make_pair(rosters[i]->getStartTimeLocAct(), rosters[i]->getRestStartLocAct() + 1));
				//days += TimeUtils::DiffCalendarDay(rosters[i]->getStartTimeLocAct(), rosters[i]->getEndTimeLocAct());
			}
		}
		else {
			if (!ruleParam.MatchRestParam(rosters[i])) {
				restMap.insert(make_pair(start, rosters[i]->getStartTimeLocAct()));
				//days += TimeUtils::CalculateFullDaysBetweenTimes(rosters[startIndex]->getEndTimeLocAct(), rosters[i]->getStartTimeLocAct());
				start = rosters[i]->getRestStartLocAct() + 1;
			}

		}
		if (i == endIndex - 1) {
			restMap.insert(make_pair(start, endTime + 1));
		}
	}
	for (map<time_t, time_t>::iterator iter = restMap.begin(); iter != restMap.end(); iter++){
	
		const auto& restStart = (*iter).first;
		const auto& restEnd = (*iter).second;
		days += TimeUtils::CalculateFullDaysBetweenTimes(restStart, restEnd);
	}
	return days;
}

void CheckMinRestBetweenConsecutiveDaysRule::ThrowRuleViolation() const {
	const auto& beforeConsecutiveDays = _ruleViolation.GetParam("beforeConnDays");
	const auto& afterConsecutiveDays = _ruleViolation.GetParam("afterConnDays");
	const auto& beforeAssignments = _ruleViolation.GetParam("beforeAssignments").empty() ? "*" : _ruleViolation.GetParam("beforeAssignments");
	const auto& beforeAssignmentGroups = _ruleViolation.GetParam("beforeAssignmentGroups").empty() ? "*" : _ruleViolation.GetParam("beforeAssignmentGroups");
	const auto& afterAssignments = _ruleViolation.GetParam("afterAssignments").empty() ? "*" : _ruleViolation.GetParam("afterAssignments");
	const auto& afterAssignmentGroups = _ruleViolation.GetParam("afterAssignmentGroups").empty() ? "*" : _ruleViolation.GetParam("afterAssignmentGroups");
	const auto& minRestDays = _ruleViolation.GetParam("minRestDays");
	const auto& restAssignments = _ruleViolation.GetParam("restAssignments").empty() ? "*" : _ruleViolation.GetParam("restAssignments");
	const auto& restAssignmentGroups = _ruleViolation.GetParam("restAssignmentGroups").empty() ? "*" : _ruleViolation.GetParam("restAssignmentGroups");
	string errorMsg;
	errorMsg = "Before Assignments:{0:beforeAssignments} Assignment Groups:{1:beforeAssignmentGroups} is {2:beforeConsecutiveDays} days, After Assignments: {3:afterAssignments} Assignment Groups:{4:afterAssignmentGroups} is {5:afterConsecutiveDays} need at least {6:minRestDays} days rest(Rest Assignments:{7:restAssignments} Rest Assignment Groups:{8:restAssignmentGroups})";
	errorMsg = StringUtils::Format(errorMsg, beforeAssignments, beforeAssignmentGroups, beforeConsecutiveDays, afterAssignments, afterAssignmentGroups, afterConsecutiveDays, minRestDays, restAssignments, restAssignmentGroups);
	
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->violation_msg = errorMsg;
	rv->idRule = _ruleParams[0].GetId();
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->description = _ruleParams[0].GetDescription();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMinRestBetweenConsecutiveDaysRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinRestBetweenConsecutiveDaysRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool CheckMinRestBetweenConsecutiveDaysRule::CheckRuleWithRDOPattern(const vector<SharedPtr<ROSTER>> &rosters,
                                                                     const bitset<Helper6001::RosterPeriodLength> &status,
                                                                     time_t windowStartLoc) const {
    if (this->_ruleParams.empty() || rosters.empty()) {
        return true;
    }

    bool passAllRule = true;

    time_t checkedStartTime = 0, checkedEndTime = 0;
    if (this->_application == ROSTER_OPTIMIZER)
    {
        checkedStartTime = this->_dbData->scenario.startDtUTC;
        checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
    }
    else
    {
        checkedStartTime = rosters[0]->actStrUtc;
        checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
    }
    std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

    for (const auto& ruleParam : _ruleParams) {
        _ruleViolation.ClearParam();
        _ruleViolation.SetRuleParam(ruleParam);
        // 计算空白天则只与roster间隙有关，无需在6001中检查
        if (ruleParam._blankDaysCount == "Y") continue;
        if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
            continue;

        time_t firstBeforeStart = 0;
        const ROSTER* prevRoster = NULL;
		size_t lastBeforeRosterIndex = 0;
        for (size_t i = 0; i < rosters.size(); i++) {

            if (ruleParam.MatchBeforeParam(rosters[i].get())) {
                if (firstBeforeStart == 0) {
                    firstBeforeStart = rosters[i]->getStartTimeLocAct();
                }
                if (prevRoster && !RosterUtils::IsConsecutiveLocalDayByRestStart(prevRoster, rosters[i].get())) {
                    const auto& lastBeforeEnd = prevRoster->getRestStartLocAct();
                    const auto& iCosecutive = TimeUtils::DiffCalendarDay(firstBeforeStart, lastBeforeEnd);
                    if (iCosecutive >= ruleParam._consecutiveDaysBeforeRest) {
                        time_t firstAfterStart = 0;
                        const ROSTER* prevAfterRoster = NULL;
                        size_t firstAfterRosterIndex = 0;
                        for (size_t j = lastBeforeRosterIndex + 1; j < rosters.size(); j++) {
                            if (ruleParam.MatchAfterParam(rosters[j].get())) {
                                if (firstAfterStart == 0) {
                                    firstAfterStart = rosters[j]->getStartTimeLocAct();
                                }
                                if (firstAfterRosterIndex == 0) {
                                    firstAfterRosterIndex = j;
                                }
                                if (prevAfterRoster && (!RosterUtils::IsConsecutiveLocalDayByRestStart(prevAfterRoster, rosters[j].get()) || j == rosters.size() - 1)) {
                                    auto lastAfterEnd = prevAfterRoster->getRestStartLocAct();
                                    if (j == rosters.size() - 1) {
                                        lastAfterEnd = rosters[j]->getRestStartLocAct();
                                    }
                                    const auto& iAfterConsecutive = TimeUtils::DiffCalendarDay(firstAfterStart, lastAfterEnd);
                                    if (iAfterConsecutive >= ruleParam._consecutiveDaysAfterRest) {
                                        auto days = GetDaysBetweenRostersWithRDOPattern(rosters, status, lastBeforeRosterIndex, firstAfterRosterIndex, ruleParam, windowStartLoc);

                                        if (days < ruleParam._minRestDays) {
                                            return false;
                                        }
                                    }
                                    firstAfterStart = rosters[j]->getStartTimeLocAct();
                                    firstAfterRosterIndex = j;
                                }
                                prevAfterRoster = rosters[j].get();
                            }
                            else if(j + 1 == rosters.size() && prevAfterRoster){
                                auto lastAfterEnd = prevAfterRoster->getRestStartLocAct();
                                const auto& iAfterConsecutive = TimeUtils::DiffCalendarDay(firstAfterStart, lastAfterEnd);
                                if (iAfterConsecutive >= ruleParam._consecutiveDaysAfterRest) {
                                    auto days = GetDaysBetweenRostersWithRDOPattern(rosters, status, lastBeforeRosterIndex, firstAfterRosterIndex, ruleParam, windowStartLoc);

                                    if (days < ruleParam._minRestDays) {
                                        return false;
                                    }
                                }
                            }
                        }
                    }
                    firstBeforeStart = rosters[i]->getStartTimeLocAct();
                }
                prevRoster = rosters[i].get();
                lastBeforeRosterIndex = i;
            }
        }

    }


    return passAllRule;
}

int CheckMinRestBetweenConsecutiveDaysRule::GetDaysBetweenRostersWithRDOPattern(const vector<SharedPtr<ROSTER>> &rosters,
                                                                                const bitset<Helper6001::RosterPeriodLength> &status,
                                                                                size_t startIndex,
                                                                                size_t endIndex,
                                                                                const CheckMinRestBetweenConsecutiveDaysRuleParam& ruleParam,
                                                                                time_t windowStartLoc) const {
    const auto &startTime = rosters[startIndex]->getRestStartLocAct();
    const auto &endTime = rosters[endIndex]->getStartTimeLocAct();
    size_t curRosterIdx = startIndex + 1;
    size_t curStatusIdx = 0;
    int fullDayCount = 0;
    time_t prevEndTime = startTime;
    while (curRosterIdx < endIndex) {
        auto rosterMatch = ruleParam.MatchRestParam(rosters[curRosterIdx].get());
        // prevEndTime到roster开始之间status所覆盖的完整天
        while (curStatusIdx < status.size()) {
            auto statusDayStart = windowStartLoc + (time_t)curStatusIdx * 24 * 3600;
            auto statusDayEnd = statusDayStart + (time_t)24 * 3600;
            ++curStatusIdx;
            if (statusDayStart < prevEndTime)
                continue;
            if (statusDayEnd > rosters[curRosterIdx]->getStartTimeLocAct())
                break;
            ++fullDayCount;
        }
        if (rosterMatch) {
            // roster所覆盖的完整天
            fullDayCount += TimeUtils::CalculateFullDaysBetweenTimes(rosters[curRosterIdx]->getStartTimeLocAct(),
                                                                     rosters[curRosterIdx]->getRestStartLocAct() + 60);
        }
        prevEndTime = rosters[curRosterIdx]->getRestStartLocAct();
        ++curRosterIdx;
    }
    // curRosterIdx之后还有status需继续计算roster结束之后的status天数
    while (curStatusIdx < status.size()) {
        auto statusDayStart = windowStartLoc + (time_t)curStatusIdx * 24 * 3600;
        auto statusDayEnd = statusDayStart + (time_t)24 * 3600;
        ++curStatusIdx;
        if (statusDayStart < prevEndTime)
            continue;
        if (statusDayEnd > rosters[endIndex]->getStartTimeLocAct())
            break;
        ++fullDayCount;
    }
    return fullDayCount;
}
