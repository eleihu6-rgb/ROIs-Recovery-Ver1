/**
 * @file LimitMinRestLFESFlightForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitMinRestLFESFlightForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"

bool LimitMinRestLFESFlightForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
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
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool LimitMinRestLFESFlightForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMinRestLFESFlightForPRRuleParam& ruleParam) const {
	bool valid = true;
	int totalConsecutiveTimes = 0;//合计连续次数
	Duty* prevDuty = nullptr;
	std::vector<Duty*> subDuties;//记录满足匹配条件Duty的连续集合
	ROSTER* lastMatchedRoster = nullptr;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			//不连续，检查是否满足Roster之间休息间隔时长要求
			if (totalConsecutiveTimes > ruleParam._maxConsecutiveTimes) {
				valid = false;
				ThrowRuleViolation(roster, subDuties.front()->getStartTimeUtcAct(), subDuties.back()->getEndTimeUtcAct(), totalConsecutiveTimes, ruleParam);
				if (!this->IsCheckAllRule()) {
					return valid;
				}
			}

			totalConsecutiveTimes = 0;//重新累计连续天
			prevDuty = nullptr;
			subDuties.clear();
			continue;
		}
		for (auto& currDuty : roster->pairing->getDutyVec()) {
			if (ruleParam.MatchParam(currDuty, roster->pairing)) {
				lastMatchedRoster = (ROSTER*)roster;
				int consecutiveTimes = DutyUtils::GetConsecutiveTimesWithCurrDuty(prevDuty, currDuty);
				if (consecutiveTimes < 0) {
					//不连续，检查是否满足Roster之间休息间隔时长要求
					if (totalConsecutiveTimes > ruleParam._maxConsecutiveTimes) {
						valid = false;
						ThrowRuleViolation(roster, subDuties.front()->getStartTimeUtcAct(), subDuties.back()->getEndTimeUtcAct(), totalConsecutiveTimes, ruleParam);
						if (!this->IsCheckAllRule()) {
							return valid;
						}
					}
					totalConsecutiveTimes = 0;//重新累计连续天
					prevDuty = nullptr;
					subDuties.clear();
					continue;
				}
				subDuties.emplace_back(currDuty);
				totalConsecutiveTimes += consecutiveTimes;
				prevDuty = currDuty;
			}
			else {
				//不满足条件，则不连续，此时检查是否满足连续次数条件
				if (totalConsecutiveTimes > ruleParam._maxConsecutiveTimes) {
					valid = false;
					ThrowRuleViolation(roster, subDuties.front()->getStartTimeUtcAct(), subDuties.back()->getEndTimeUtcAct(), totalConsecutiveTimes, ruleParam);
					if (!this->IsCheckAllRule()) {
						return valid;
					}
				}

				totalConsecutiveTimes = 0;//重新累计连续天
				prevDuty = nullptr;
				subDuties.clear();
			}
			
		}
	}

	if (totalConsecutiveTimes > ruleParam._maxConsecutiveTimes) {
		valid = false;
		ThrowRuleViolation(lastMatchedRoster, subDuties.front()->getStartTimeUtcAct(), subDuties.back()->getEndTimeUtcAct(), totalConsecutiveTimes, ruleParam);
		if (!this->IsCheckAllRule()) {
			return valid;
		}
	}

	return valid;
}

void LimitMinRestLFESFlightForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitMinRestLFESFlightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitMinRestLFESFlightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitMinRestLFESFlightForPRRule::ThrowRuleViolation(const ROSTER* roster, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc, const int numberOfDuty, const LimitMinRestLFESFlightForPRRuleParam& ruleParam) const {
	//在执行连续任务时，实际休息时长小于最小休息时长。
	string msg = "The number of consecutive Late Finish/Early Start Duties ({0:numberOfDuty}) exceeds {1:maxConsecutiveTimes} times.";
	msg = StringUtils::Format(msg, numberOfDuty, ruleParam._maxConsecutiveTimes);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = checkedStartTimeUtc;
	rv->endDTUtc = checkedEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("numberOfDuty", std::to_string(numberOfDuty)));
	rv->operation_result.insert(pair<string, string>("maxConsecutiveTimes", std::to_string(ruleParam._maxConsecutiveTimes)));

	_ruleViolation.AddRuleViolations(rv);
}