/**
 * @file MaxFlightDutyBySplitDutyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "CalculateAirportRestFaciltyRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateAirportRestFaciltyRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateAirportRestFaciltyRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateAirportRestFaciltyRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (auto& duty : duties) {
		for (int i = 0; i < (int)(duty->getNumSegments()) - 1; i++) {
			Segment* currSegment = duty->getSegment(i);
			Segment* nextSegment = duty->getSegment(i + 1);
			for (const auto & ruleParam : _ruleParams) {
				if (!CalculateDuty(currSegment, nextSegment, base, ruleParam)) {
					break;
				}
			}
		}
	}
}

bool CalculateAirportRestFaciltyRule::CalculateDuty(Segment* currSegment, const Segment* nextSegment, 
	const std::string& base, const CalculateAirportRestFaciltyRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*currSegment, *nextSegment, base)) {
		if (checkRestFaciltyPriority(currSegment->getArrStationRestFacilty(), ruleParam._airportRestFacilty)) {
			currSegment->setArrStationRestFacilty(ruleParam._airportRestFacilty);
		}
		//next = false;
	}
	return next;
}

bool CalculateAirportRestFaciltyRule::checkRestFaciltyPriority(const string& srcRestFacilty, const string& destRestFacilty) {
	if (srcRestFacilty.empty()) {
		return true;
	}
	if (srcRestFacilty == "R" && destRestFacilty == "S") {
		//休息设施 S 可以覆盖 R
		return true;
	}
	return false;
}

void CalculateAirportRestFaciltyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateAirportRestFaciltyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateAirportRestFaciltyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}