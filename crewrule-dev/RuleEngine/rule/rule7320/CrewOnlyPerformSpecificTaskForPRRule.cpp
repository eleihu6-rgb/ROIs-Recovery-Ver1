/**
 * @file CrewOnlyPerformSpecificTaskForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#include "../RuleSytem.h"
#include "CrewOnlyPerformSpecificTaskForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"


bool CrewOnlyPerformSpecificTaskForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
		//if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
		//	continue;
		//}
		if (!ruleParam.MatchCrewNationalities(crew)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool CrewOnlyPerformSpecificTaskForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	std::vector<const ROSTER*> subRosters;//满足Crew条件的roster的子集
	for (auto& roster : rosters) {
		if (roster != nullptr && !PhaseUtils::IsChecked(roster, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (ruleParam.MatchCrew(roster, crew)) {
			subRosters.emplace_back(roster);
		}
	}

	bool canOperateOtherTask = false;//是否存在能执行其他任务。false：未执行其他任务，true：执行其他任务
	for (auto& roster : subRosters) {
		if (roster->pairing == nullptr) {
			if (!CanOperate(roster, ruleParam)) {
				passAllRule = false;
				ThrowRuleViolationForGroundRoster(roster, crew, ruleParam);
				if (!IsCheckAllRule()) {
					return false;
				}
			}
		}
		else {
			for (auto& segment : roster->pairing->getSegmentsRead()) {
				if (!CanOperate(roster, segment, ruleParam)) {
					passAllRule = false;
					ThrowRuleViolationForFlight(roster, crew, segment, ruleParam);
					if (!IsCheckAllRule()) {
						return false;
					}
				}
			}
		}
	}
	return passAllRule;
}

bool CrewOnlyPerformSpecificTaskForPRRule::CanOperate(const ROSTER* roster, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const {
	if (ruleParam.MatchGroundRoster(roster)) {
		return true;
	}
	return false;
}

bool CrewOnlyPerformSpecificTaskForPRRule::CanOperate(const ROSTER* roster, const Segment* segment, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const {
	if (ruleParam.MatchFlight(roster, segment)) {
		return true;
	}
	return false;
}

void CrewOnlyPerformSpecificTaskForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CrewOnlyPerformSpecificTaskForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CrewOnlyPerformSpecificTaskForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CrewOnlyPerformSpecificTaskForPRRule::ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const {
	//被过滤Crew只能执行特定航班任务
	string msg = "Filtered crew (Para: {0:crewFilterConditon}) can only perform specific flights (Para: {1:taskFilterConditon}).";
	msg = StringUtils::Format(msg, ruleParam.GetCrewFilterConditionDesc(), ruleParam.GetTaskFilterConditionDesc());

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("airline", segment->getAirline()));
	rv->operation_result.insert(pair<string, string>("flightNum", segment->getFlightNumber()));

	_ruleViolation.AddRuleViolations(rv);
}

void CrewOnlyPerformSpecificTaskForPRRule::ThrowRuleViolationForGroundRoster(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const {
	//被过滤Crew只能执行特定地面任务
	string msg = "Filtered crew (Para: {0:crewFilterConditon}) can only perform specific ground duties (Para: {1:taskFilterConditon}).";
	msg = StringUtils::Format(msg, ruleParam.GetCrewFilterConditionDesc(), ruleParam.GetTaskFilterConditionDesc());

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->startDTUtc = roster->getStartTimeUtcAct();
	rv->endDTUtc = roster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("assignment", roster->qualifier));
	_ruleViolation.AddRuleViolations(rv);
}