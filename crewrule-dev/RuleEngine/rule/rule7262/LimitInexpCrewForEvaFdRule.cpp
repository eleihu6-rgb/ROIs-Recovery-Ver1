/**
 * @file LimitInexpCrewForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitInexpCrewForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"


bool LimitInexpCrewForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}

		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		_ruleViolation.SetParam("crewId", crew->idCrew);

		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);

			bool valid = CheckRule(roster, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
			}
		}

		return passAllRule;
	}
	return passAllRule;
}


bool LimitInexpCrewForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitInexpCrewForEvaFdRuleParam& ruleParam) const {
	bool valid = true;

	for (auto& segment : roster->pairing->getSegments()) {
		auto iter = this->_dbData->crewOnFlt.find(segment->getDBId());
		if (iter == this->_dbData->crewOnFlt.end()) {
			continue;
		}
		int inExpCrewNum = 0;
		auto& cofs = iter->second;
		for (auto& cof : cofs) {
			if (ruleParam.MatchParam(segment, cof)) {
				inExpCrewNum++;
				if (inExpCrewNum > ruleParam._maxNumOfCrew) {
					_ruleViolation.SetParam("inexpCrewNum", StringUtils::itos(inExpCrewNum));
					valid = false;
					ThrowRuleViolation(roster, segment, ruleParam);
					break;
				}
			}
		}
	}

	return valid;
}

void LimitInexpCrewForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitInexpCrewForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitInexpCrewForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitInexpCrewForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const Segment* segment, const LimitInexpCrewForEvaFdRuleParam& ruleParam) const {
	string inexpCrewNum = _ruleViolation.GetParam("inexpCrewNum");

	//菜鸟机组人员人数超过最大人数限制
	string msg = "The number of inexperienced crew on flight ({0:airline}{1:fltNum}) is greater than the maximum number ({2:maxInexpCrewNum}).";
	msg = StringUtils::Format(msg, segment->getAirline(), segment->getFlightNumber(), ruleParam._maxNumOfCrew);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->dutySequenceNumber = segment->getDutySeq();
		rv->segmentId = segment->getDBId();
		rv->startDTUtc = segment->getStartTimeUtcAct();
		rv->endDTUtc = segment->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("inexpCrewNum", inexpCrewNum));
	rv->operation_result.insert(pair<string, string>("maxInexpCrewNum", StringUtils::itos(ruleParam._maxNumOfCrew)));
	rv->operation_result.insert(pair<string, string>("airline", segment->getAirline()));
	rv->operation_result.insert(pair<string, string>("fltNum", segment->getFlightNumber()));

	_ruleViolation.AddRuleViolations(rv);


}