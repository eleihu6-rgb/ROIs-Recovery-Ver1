/**
 * @file CheckMinConnectInDutyRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinConnectInDutyRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckMinConnectInDutyRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;
	for (const auto& roster : rosters) {
		if (!roster->pairing)
			continue;
		const auto& duties = roster->pairing->getDutyVec();
		if (!CheckRule(duties, rosters[0]->idcrew)) {
			if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
				return false;
			passAllRule = false;
		}
	}
	return passAllRule;
	
}

bool CheckMinConnectInDutyRule::CheckRule(const vector<Duty*>& duties, const std::string crewId) const {
	if (this->_ruleParams.empty() || duties.empty()) {
		return true;
	}
	std::vector<Segment*> segments;
	for (const auto& duty : duties) {
		segments.insert(segments.end(), duty->getSegmentsRead().begin(), duty->getSegmentsRead().end());
	}
	bool passAllRule = true;

	for (size_t i = 0; i < segments.size() - 1; i++) {
		for (const auto& _ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(_ruleParam);
			_ruleViolation.SetParam("crew_id", crewId);
			const auto& segment1 = segments[i];
			const auto& segment2 = segments[i + 1];
			if (_ruleParam._type == "PAIRING" || segment1->getDutySeq() == segment2->getDutySeq()) {
				bool mantchRule = MatchRule(segment1, segment2, _ruleParam);

				if ((segment1 != nullptr && !PhaseUtils::IsChecked(segment1, _ruleParam.GetPhase(), this->_dbData)) || 
					(segment2 != nullptr && !PhaseUtils::IsChecked(segment2, _ruleParam.GetPhase(), this->_dbData))) {
					continue;
				}

				if (MatchRule(segment1, segment2, _ruleParam)) {
					if (!CheckRule(segments[i], segments[i + 1], _ruleParam)) {
						if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
							return false;
						passAllRule = false;
					}
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMinConnectInDutyRule::CheckRule(const vector<Segment *> &segments) const {
	if (this->_ruleParams.empty() || segments.size() <= 1) {
		return true;
	}
	bool passAllRule = true;
	for (size_t i = 0; i < segments.size() - 1; i++) {
		for (const auto& _ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(_ruleParam);
			const auto& segment1 = segments[i];
			const auto& segment2 = segments[i + 1];
			if (_ruleParam._type == "PAIRING" || segment1->getDutySeq() == segment2->getDutySeq()) {
				bool mantchRule = MatchRule(segment1, segment2, _ruleParam);
				if (MatchRule(segment1, segment2, _ruleParam)) {
					if (!CheckRule(segments[i], segments[i + 1], _ruleParam)) {
						if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
							return false;
						passAllRule = false;
					}
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMinConnectInDutyRule::CheckRule(const Segment* segment1, const Segment* segment2, const CheckMinConnectInDutyRuleParam& _ruleParam) const {
	// 大过站不校验
	if (segment1->getDutySeq() == segment2->getDutySeq()) {
		Segment* seg1 = const_cast<Segment*>(segment1);
		Segment* seg2 = const_cast<Segment*>(segment2);
		const auto& longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg1, seg2);
		if (longTransit != nullptr) {
			return true;
		}
	}

	int connTime = static_cast<int>(segment2->getStartTimeUtcAct() - segment1->getEndTimeUtcAct()) / 60;
	if (!_ruleParam.CheckConnTime(connTime)) {
		if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
			return false;
		_ruleViolation.SetParam("act_conn", TimeUtils::MinutesTohhmm(connTime));
		_ruleViolation.SetParam("min_conn", TimeUtils::MinutesTohhmm(_ruleParam._mct));
		_ruleViolation.SetParam("max_conn", TimeUtils::MinutesTohhmm(_ruleParam._maxConn));
		_ruleViolation.SetParam("pairing_id", to_string(segment1->getPairingId()));
		_ruleViolation.SetParam("segment_id", to_string(segment1->getDBId()));
		_ruleViolation.SetParam("start", to_string(segment1->getEndTimeUtcAct()));
		_ruleViolation.SetParam("end", to_string(segment2->getStartTimeUtcAct()));
		ThrowRuleViolation(_ruleParam);
	}

	return true;
}

bool CheckMinConnectInDutyRule::MatchRule(const Segment* segment1, const Segment* segment2, const CheckMinConnectInDutyRuleParam& _ruleParam) const {
	if (_ruleParam.MatchInboundFlight(segment1) && _ruleParam.MatchOutboundFlight(segment2) && _ruleParam.MatchAircraftChange(segment1, segment2)) {
		return true;
	}
	return false;
}

void CheckMinConnectInDutyRule::ThrowRuleViolation(const CheckMinConnectInDutyRuleParam& ruleParam) const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& pairingId = stoll(_ruleViolation.GetParam("pairing_id"));
	const auto& segmentId = stoll(_ruleViolation.GetParam("segment_id"));
	const auto& act_conn = _ruleViolation.GetParam("act_conn");
	const auto& min_conn = _ruleViolation.GetParam("min_conn");
	const auto& max_conn = _ruleViolation.GetParam("max_conn");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);

	string msgViolation = "Actual minimum connection time is less than the standard minimum requirements.";
	if (ruleParam._mct > 0 && ruleParam._maxConn > 0) {
		msgViolation = "Actual minimum connection time (" + act_conn + ") is less than the standard minimum connection time(" + min_conn + ") or is more than the standard maximum connection time(" + max_conn + ").";
	}
	else if (ruleParam._mct > 0) {
		msgViolation = "Actual minimum connection time (" + act_conn + ") is less than the standard minimum connection time(" + min_conn + ").";
	}
	else if (ruleParam._maxConn > 0) {
		msgViolation = "Actual minimum connection time (" + act_conn + ") is more than the standard maximum connection time(" + max_conn + ").";
	}
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (crewId.empty()) {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	}
	rv->crewId = crewId;
	rv->pairingId = pairingId;
	rv->segmentId = segmentId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msgViolation;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMinConnectInDutyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinConnectInDutyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
