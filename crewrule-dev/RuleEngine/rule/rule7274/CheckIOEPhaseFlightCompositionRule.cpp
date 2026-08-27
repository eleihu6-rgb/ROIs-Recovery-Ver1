/**
 * @file CheckIOEPhaseFlightCompositionRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckIOEPhaseFlightCompositionRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckIOEPhaseFlightCompositionRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;


	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		for (const auto& roster : rosters) {
			if (!roster->pairing)
				continue;

			const auto& segments = roster->pairing->getSegments();
			for (const auto& seg : segments) {
				const auto& rosterFlight = this->_dbData->rosterFlightMgr.get(seg->getDBId(), roster->idcrew);
				if (!rosterFlight)
					continue;
				if (_ruleParam.MatchFlight(seg) && _ruleParam.MatchRosterFlight(rosterFlight) && _ruleParam.MatchTraining(rosterFlight)) {
					std::vector<shared_ptr<RosterFlight>> teRosterFlights;
					const auto& rfs = this->_dbData->rosterFlightMgr.get(seg->getDBId());
					for (const auto& rf : rfs) {
						if (_ruleParam.MatchRosterFlight(rf))
							teRosterFlights.push_back(rf);
					}
					const auto& compositionWithoutTE = GetCompositionWithoutTE(teRosterFlights, seg);
					if (!_ruleParam.MatchCompostion(compositionWithoutTE)) {
						if (this->_application == ROSTER_OPTIMIZER)
							return false;
						_ruleViolation.SetParam("crew_id", roster->idcrew);
						_ruleViolation.SetParam("roster_id", to_string(roster->rosterId));
						_ruleViolation.SetParam("pairing_id", to_string(roster->pairId));
						_ruleViolation.SetParam("segment_id", to_string(seg->getDBId()));
						_ruleViolation.SetParam("start", to_string(seg->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(seg->getEndTimeUtcAct()));
						ThrowRuleViolation();
					}
				}
			}
		}
	}
	
	return passAllRule;

}

std::map<std::string, int> CheckIOEPhaseFlightCompositionRule::GetCompositionWithoutTE(const std::vector<shared_ptr<RosterFlight>> & rosterFlights, const Segment* seg) const {
	
	std::map<std::string, int> result;

	const auto& pairings = this->_dbData->flightIdToPairing.find(seg->getDBId());
	if (pairings == this->_dbData->flightIdToPairing.end())
		result = seg->getPlanComposition();
	else {
		for (const auto& pairingId : pairings->second) {
			if (this->_dbData->pairingIdMap.find(pairingId) != this->_dbData->pairingIdMap.end()) {
				const auto& pairing = this->_dbData->pairingIdMap.at(pairingId);
				const auto& pairComp = pairing->getComplements();

				for (auto iter = pairComp.begin(); iter != pairComp.end(); iter++) {
					//过滤非必要成员岗位
					if (this->_dbData->rankMap.find(iter->first) == this->_dbData->rankMap.end() || !this->_dbData->rankMap.at(iter->first).isMustCrewRank)
						continue;
					if (result.find(iter->first) == result.end())
						result[iter->first] = iter->second;
					else
						result[iter->first] += iter->second;
				}
			}
		}
	}

	if (rosterFlights.empty())
		return result;
	
	//std::map<std::string, int> result = seg->getPlanComposition();

	for (const auto& rf : rosterFlights) {
		if (result.find(rf->actingRank) != result.end()) {
			if (result[rf->actingRank] == 0)
				continue;
			result[rf->actingRank]--;
		}
	}
	// 删除为0的数据
	std::map<std::string, int>::iterator it = result.begin();
	while (it != result.end()) {
		if (it->second == 0) {
			it = result.erase(it);
		}else {
			it++;
		}
	}
	return result;
}

void CheckIOEPhaseFlightCompositionRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& pairingId = stoll(_ruleViolation.GetParam("pairing_id"));
	const auto& rosterId = stoll(_ruleViolation.GetParam("roster_id"));
	const auto& segmentId = stoll(_ruleViolation.GetParam("segment_id"));
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string msgViolation = "The current flight composition is out of the required range.";
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->pairingId = pairingId;
	rv->rosterId = rosterId;
	rv->segmentId = segmentId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msgViolation;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckIOEPhaseFlightCompositionRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckIOEPhaseFlightCompositionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
