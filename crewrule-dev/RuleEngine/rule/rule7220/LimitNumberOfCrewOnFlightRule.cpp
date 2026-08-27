/**
 * @file LimitNumberOfCrewOnFlightRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitNumberOfCrewOnFlightRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"

bool LimitNumberOfCrewOnFlightRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (const auto & ruleParam : _ruleParams) {

		std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		for (auto roster : rosters) {
			if (roster->pairing == nullptr) {
				continue;
			}
			bool valid = CheckRule(roster, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}


bool LimitNumberOfCrewOnFlightRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitNumberOfCrewOnFlightRuleParam& ruleParam) const {
	bool passAllRule = true;
	auto& crewsOnFlt = this->GetDataContext()->crewOnFlt;
	auto& crewRpRecencyIndex = this->GetDataContext()->crewRpRecencyIndex;

	if (!ruleParam._actingRanks.empty() && ruleParam._actingRanks[0] != "" && ruleParam._actingRanks[0] != "*" &&
		find(ruleParam._actingRanks.begin(), ruleParam._actingRanks.end(), roster->actingRank) == ruleParam._actingRanks.end())
		return true;

	for (const auto& segment : roster->pairing->getSegmentsRead())
	{
		if (!segment->getIsOperating())
			continue;

		if (!ruleParam.MatchFlightAirline(segment)) {
			continue;
		}
		
		if (RosterUtils::ExistExceptionCode(roster, segment, ruleParam.GetExceptionCodes(), _dbData)) {
			continue;
		}

		auto iter = crewsOnFlt.find(segment->getDBId());//find by flight id
		if (iter == crewsOnFlt.end())
		{
			continue;
		}
		bool valid = true;
		int numOfCrew = 0;
		vector<string> cofCrewIds;
		auto& cofs = iter->second;
		for (auto& cof : cofs)
		{
			if (cof->crew != nullptr && crew->division != cof->crew->division)
				continue;

			if (cof->assignment != "FLY" && cof->assignment != "OPR") {
				continue;
			}

			if (!ruleParam._actingRanks.empty() && ruleParam._actingRanks[0] != "" && ruleParam._actingRanks[0] != "*" &&
				find(ruleParam._actingRanks.begin(), ruleParam._actingRanks.end(), cof->actingRank) == ruleParam._actingRanks.end())
				continue;

			auto iterFleet = this->GetDataContext()->fleetMap.find(segment->getFleetCD());
			if (iterFleet == this->GetDataContext()->fleetMap.end()) {
				continue;
			}

			int blh = crewRpRecencyIndex->getCrewBlhOnFleetGroup(cof->crewId, iterFleet->second.fleetGrp, segment->getStartTimeUtcAct());
			if (blh < ruleParam._minBLHOnFlightMinutes) {
				numOfCrew++;
				cofCrewIds.emplace_back(cof->crewId);
			}
			if (numOfCrew > ruleParam._maxNumOfCrew) {
				valid = false;
				passAllRule = false;
				_ruleViolation.SetParam("fleetGrp", iterFleet->second.fleetGrp);
				if (!this->IsCheckAllRule()) {
					return passAllRule;
				}

				
			}
		}
		if (!valid) {
			stringstream ss;
			for (size_t i = 0; i < cofCrewIds.size(); i++) {
				ss << cofCrewIds[i];
				if (i < cofCrewIds.size() - 1) {
					ss << ",";
				}
			}
			_ruleViolation.SetParam("numOfCrew", StringUtils::itos(numOfCrew));
			_ruleViolation.SetParam("cofCrewIds", ss.str());
			ThrowRuleViolation(roster, segment, ruleParam);
		}
	}
	return passAllRule;
}

void LimitNumberOfCrewOnFlightRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitNumberOfCrewOnFlightRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitNumberOfCrewOnFlightRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitNumberOfCrewOnFlightRule::ThrowRuleViolation(const ROSTER* roster, const Segment* segment, const LimitNumberOfCrewOnFlightRuleParam& ruleParam) const {
	std::string cofCrewIds = _ruleViolation.GetParam("cofCrewIds");
	std::string numOfCrew = _ruleViolation.GetParam("numOfCrew");
	std::string fleetGrp = _ruleViolation.GetParam("fleetGrp");
	string flightNo = segment->getAirline() + segment->getFlightNumber();
	string flightDate = utcToUtcDtString(utcStrToUtc((char*)segment->getDate().c_str()));
	string fleet = segment->getFleetCD();

	string msg = "More than {0:maxNumOfCrew} crew and less than {1:minBLHOnFlight} flight time.(Flight No={2:flightNo}, Date={3:flightDate}, Fleet={4:fleet}, Fleet Group={5:fleetGrp}, Flight Id={6:flightId}, COF CrewIds:{7:cofCrewIds})";
	msg = StringUtils::Format(msg, ruleParam._maxNumOfCrew, ruleParam._minBLHOnFlight, flightNo, flightDate, fleet, fleetGrp, segment->getDBId(), cofCrewIds);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getSegmentId();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("cofCrewIds", cofCrewIds));
	rv->operation_result.insert(pair<string, string>("numOfCrew", numOfCrew));
	rv->operation_result.insert(pair<string, string>("maxNumOfCrew", StringUtils::itos(ruleParam._maxNumOfCrew)));
	rv->operation_result.insert(pair<string, string>("minBLHOnFlight", ruleParam._minBLHOnFlight));
	rv->operation_result.insert(pair<string, string>("flightId", StringUtils::lltos(segment->getDBId())));
	rv->operation_result.insert(pair<string, string>("flightNo", flightNo));
	rv->operation_result.insert(pair<string, string>("flightDate", flightDate));
	rv->operation_result.insert(pair<string, string>("fleet", fleet));
	rv->operation_result.insert(pair<string, string>("fleetGrp", fleetGrp));
	
	_ruleViolation.AddRuleViolations(rv);
}