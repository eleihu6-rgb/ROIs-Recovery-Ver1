/**
 * @file CheckMinNumCrewRankRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinNumCrewRankRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool CheckMinNumCrewRankRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (auto roster : rosters) {
		if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		if (roster->pairing == nullptr) {
			continue;
		}

		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.ClearParam();
			_ruleViolation.SetRuleParam(ruleParam);

			if (!CheckRule(roster->pairing, crew, ruleParam)) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}

	return passAllRule;
}

bool CheckMinNumCrewRankRule::CheckRule(const Pairing* pairing, const std::shared_ptr<CREW>& crew, const CheckMinNumCrewRankRuleParam& ruleParam) const {
	bool valid = true;
	for (auto& duty : pairing->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			if (ruleParam.MatchParam(*segment, crew)) {
				if (!CheckRule(segment, ruleParam)) {
					_ruleViolation.SetParam("crewRanks", ruleParam._strCrewRanks);
					ThrowRuleViolation(duty, segment);
					valid = false;
				}
			}
		}
	}
	return valid;
}

bool CheckMinNumCrewRankRule::CheckRule(const Segment* segment, const CheckMinNumCrewRankRuleParam& ruleParam) const {
	bool valid = true;

	auto& dbData = this->GetDataContext();
	auto rfs = dbData->rosterFlightMgr.get(segment->getDBId());

	if (!ruleParam.MatchSegmentCrewNumber(rfs)) {
		return true;
	}
	int crewRankNum = 0;
	for (auto& rf : rfs) {
		auto iterCrew = dbData->crewIdMap.find(rf->crewId);
		if (iterCrew == dbData->crewIdMap.end()) {
			continue;
		}

		//由于roster_flight的activeRank存在错误数据，改成从crew rank直接获取
		//if (std::find(ruleParam._crewRanks.begin(), ruleParam._crewRanks.end(), rf->activeRank) != ruleParam._crewRanks.end()) {
		//	crewRankNum++;
		//}

		if (std::find(ruleParam._segmentAssignments.begin(), ruleParam._segmentAssignments.end(), rf->assignment) == ruleParam._segmentAssignments.end()) {
			continue;
		}

		for (auto& rank : iterCrew->second->rankList) {
			if ((rank->effUtc <= segment->getStartTimeUtcAct()) && (rank->expUtc < 0 || rank->expUtc > segment->getEndTimeUtcAct()))
			{
				if (std::find(ruleParam._crewRanks.begin(), ruleParam._crewRanks.end(), rank->rank) != ruleParam._crewRanks.end()) {
					crewRankNum++;
					break;
				}
			}
		}
	}
	return crewRankNum >= ruleParam._minNumber;
}

void CheckMinNumCrewRankRule::ThrowRuleViolation(const Duty* duty, const Segment* segment) const {
	string crewRanks = _ruleViolation.GetParam("crewRanks");

	//航班(XXX)的人员岗位(XXX)数量小于最小要求
	std::string msg = "The number of crew ({0:crewRanks}) on flight ({1:airline}{2:fltNum}) is less than the minimum required number of crew.";
	msg = StringUtils::Format(msg, crewRanks, segment->getAirline(), segment->getFlightNumber());

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMinNumCrewRankRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->segmentId = segment->getDBId();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckMinNumCrewRankRule::RuleFuncId);
	}
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("airline", segment->getAirline()));
	rv->operation_result.insert(pair<string, string>("fltNum", segment->getFlightNumber()));
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMinNumCrewRankRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinNumCrewRankRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckMinNumCrewRankRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}