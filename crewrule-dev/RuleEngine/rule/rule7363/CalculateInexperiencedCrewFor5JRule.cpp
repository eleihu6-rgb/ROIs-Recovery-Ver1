#include "CalculateInexperiencedCrewFor5JRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/NumberUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateInexperiencedCrewFor5JRule::Calculate(std::vector<const ROSTER*>& rosters, string crewId) const {
	if (_ruleParams.empty()) {
		return ;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[crewId];

	//没有firstDutyDay不计算
	if (!crew->crewFirstDutyInfo)
		return;

	time_t firstDutyDay = crew->crewFirstDutyInfo->lastFirstDutyDate;
	int totalBlh = crew->crewFirstDutyInfo->totalBlh;
	int totalFltNum = crew->crewFirstDutyInfo->totalFltNum;
	map<string, int> totalAirports = crew->crewFirstDutyInfo->airports;
	int totalAirportNum = 0;
	for (const auto& airport : totalAirports) {
		totalAirportNum += airport.second;
	}

	string crewBase = crew->getPrimeBase();
	//int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());
	for (const auto& ruleParam : _ruleParams) {
		
		for (const auto& roster : rosters) {
			
			if (roster->getEndTimeLocAct() < firstDutyDay)
				continue;

			if (!ruleParam.MatchCrewQualification(roster, crew))
				continue;

			if (!roster->pairing || roster->qualifier != "FLY")
				continue;

			for (const auto& segment : roster->pairing->getSegmentsRead()) {
				if (!segment->getIsOperating())
					continue;

				++totalFltNum;
				totalBlh += segment->getBlkMinutes();
				if (ruleParam.MatchParam(segment)) {
					++totalAirportNum;
				}
				if (ruleParam.MatchMinOperating(totalBlh, totalFltNum, totalAirportNum)) {
					crew->crewFirstDutyInfo->inexperiencedEndDate = segment->getEndTimeLocAct();
					return;
				}
			}
		}
	}
	crew->crewFirstDutyInfo->inexperiencedEndDate = this->_dbData->scenario.endDtLoc + 60 * 60 * 24 - 1;
}

void CalculateInexperiencedCrewFor5JRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateInexperiencedCrewFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateInexperiencedCrewFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}