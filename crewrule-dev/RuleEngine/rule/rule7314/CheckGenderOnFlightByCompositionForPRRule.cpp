/**
 * @file CheckGenderOnFlightByCompositionForPRRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckGenderOnFlightByCompositionForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/SegmentUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckGenderOnFlightByCompositionForPRRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	bool passAllRule = true;

	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("pairing_id", to_string(pairing->getDbId()));

		if (pairing != nullptr && !PhaseUtils::IsChecked(pairing, _ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (_ruleParam.MatchPairing(pairing)) {
			const auto& duties = pairing->getDutyVec();
			for (const auto& duty : duties) {
				const auto& segments = duty->getSegmentsRead();
				for (const auto& segment : segments) {
					if (!segment->getIsOperating())
						continue;

					if (!_ruleParam.MatchFleets(segment->getFleetCD()))
						continue;
					
					const auto& segmentComposition = SegmentUtils::GetCompositionBySegmentFor3(segment, this->_dbData);
					
					if (!_ruleParam.MatchComposition(segmentComposition))
						continue;

					int needNumberOfCrew = _ruleParam.GetCrewNumberByActingRank(segment);

					if (!CheckCrewOnFlight(segment, needNumberOfCrew, _ruleParam)) {
						passAllRule = false;
						if (this->_application == ROSTER_OPTIMIZER)
							return false;
						_ruleViolation.SetParam("start", to_string(segment->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(segment->getEndTimeUtcAct()));
						_ruleViolation.SetParam("min_limit", _ruleParam._minMalCrews);
						_ruleViolation.SetParam("max_limit", _ruleParam._maxMalCrews);
						_ruleViolation.SetParam("pairing_id", to_string(pairing->getDbId()));
						_ruleViolation.SetParam("segment_id", to_string(segment->getSegmentId()));
						ThrowRuleViolation();
					}
				}
			}
		}
	}

	return passAllRule;

}


bool CheckGenderOnFlightByCompositionForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	for (const auto& roster : rosters) {
		if (!roster->pairing)
			continue;
		const auto& pairing = roster->pairing;
		for (const auto& _ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(_ruleParam);
			_ruleViolation.SetParam("roster_id", to_string(roster->rosterId));
			_ruleViolation.SetParam("crew_id", crew->idCrew);
			_ruleViolation.SetParam("pairing_id", to_string(pairing->getDbId()));
			
			if (pairing != nullptr && !PhaseUtils::IsChecked(pairing, _ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}
			
			if (_ruleParam.MatchPairing(pairing)) {
				const auto& duties = pairing->getDutyVec();
				for (const auto& duty : duties) {
					const auto& segments = duty->getSegmentsRead();
					for (const auto& segment : segments) {
						if (!segment->getIsOperating())
							continue;

						if (!_ruleParam.MatchFleets(segment->getFleetCD()))
							continue;

						const auto& segmentComposition = SegmentUtils::GetCompositionBySegmentFor3(segment, this->_dbData);

						if (!_ruleParam.MatchComposition(segmentComposition))
							continue;

						int needNumberOfCrew = _ruleParam.GetCrewNumberByActingRank(segment);

						if (!CheckCrewOnFlight(segment, needNumberOfCrew, _ruleParam)) {
							passAllRule = false;
							if (this->_application == ROSTER_OPTIMIZER)
								return false;
							_ruleViolation.SetParam("start", to_string(segment->getStartTimeUtcAct()));
							_ruleViolation.SetParam("end", to_string(segment->getEndTimeUtcAct()));
							_ruleViolation.SetParam("min_limit", _ruleParam._minMalCrews);
							_ruleViolation.SetParam("max_limit", _ruleParam._maxMalCrews);
							_ruleViolation.SetParam("pairing_id", to_string(pairing->getDbId()));
							_ruleViolation.SetParam("segment_id", to_string(segment->getSegmentId()));
							ThrowRuleViolation();
						}
					}
				}
			}
		}
	}
	
	
	return passAllRule;
}

bool CheckGenderOnFlightByCompositionForPRRule::CheckCrewOnFlight(const Segment* segment, const int needNumberOfCrew, const CheckGenderOnFlightByCompositionForPRRuleParam ruleParam) const {

	const auto& rfs = this->_dbData->rosterFlightMgr.get(segment->getDBId());

	int malCrewNumber = 0;
	int femaleCrewNumber = 0;

	// 所需rank总人数是否奇数
	bool isTotalOddNumber = needNumberOfCrew % 2 != 0;
	if (!ruleParam._isTotalEven.empty() && ruleParam._isTotalEven != "*") {
		// Y 需要偶数，但是人数是奇数，直接返回true，不告警，N 同理
		if ((ruleParam._isTotalEven == "Y" && isTotalOddNumber) || (ruleParam._isTotalEven == "N" && !isTotalOddNumber))
			return true;
	}


	for (const auto& rf : rfs) {
		if (this->_dbData->scenario.division != rf->division)
			continue;
		if (ruleParam.MatchActingRank(rf->actingRank)) {
			if (this->_dbData->crewIdMap.find(rf->crewId) == this->_dbData->crewIdMap.end()) {
				Logger::getRuleLogger()->error("ERROR: crewId={} not exits", rf->crewId);
				continue;
			}
			if ((ruleParam._includeDHD == "N" || ruleParam._includeDHD.empty()) && rf->assignment == "DHD")
				continue;
			const auto& crew = this->_dbData->crewIdMap[rf->crewId];
			if (crew->gender == "M")
				malCrewNumber++;
			if (crew->gender == "F")
				femaleCrewNumber++;
		}
	}

	int openCrewNumber = needNumberOfCrew - malCrewNumber - femaleCrewNumber;

	// 男组员人数 > 最大男组员人数，告警
	if (!ruleParam._maxMalCrews.empty() && ruleParam._maxMalCrews != "*" && malCrewNumber > ruleParam._maxMalCrewsNumber) {
		string actEven = "F" + to_string(femaleCrewNumber) + "：M" + to_string(malCrewNumber);
		_ruleViolation.SetParam("act_even", actEven);
		_ruleViolation.SetParam("act_male_nummber", to_string(malCrewNumber));
		return false;
	}

	// 男组员人数 + 剩余未分配岗位 < 最小男组员人数，告警
	if (!ruleParam._minMalCrews.empty() && ruleParam._minMalCrews != "*" && malCrewNumber + openCrewNumber < ruleParam._minMalCrewsNumber) {
		string actEven = "F" + to_string(femaleCrewNumber) + "：M" + to_string(malCrewNumber);
		_ruleViolation.SetParam("act_even", actEven);
		_ruleViolation.SetParam("act_male_nummber", to_string(malCrewNumber));
		return false;
	}

	
	if (ruleParam._evenDistribution == "Y") {
		bool oddNumber = false;

		if (needNumberOfCrew % 2 == 1)
			oddNumber = true;
		
		if (femaleCrewNumber + malCrewNumber < needNumberOfCrew) 
		{
			if (malCrewNumber == ruleParam._maxMalCrewsNumber && ruleParam._evenOnGender == "M") {
				if ((oddNumber && malCrewNumber % 2 == 0) || (!oddNumber && malCrewNumber % 2 == 1)) {
					string actEven = "F" + to_string(femaleCrewNumber) + "：M" + to_string(malCrewNumber);
					_ruleViolation.SetParam("act_even", actEven);
					_ruleViolation.SetParam("act_male_nummber", to_string(malCrewNumber));
					return false;
				}
			}
			return true;
		}
			
		// 分配满人员，再检查奇偶数
		if (openCrewNumber == 0) {
			if (oddNumber) {
				if ((ruleParam._evenOnGender == "M" && malCrewNumber % 2 != 0) || (ruleParam._evenOnGender == "F" && femaleCrewNumber % 2 != 0)) {
					string actEven = "F" + to_string(femaleCrewNumber) + "：M" + to_string(malCrewNumber);
					_ruleViolation.SetParam("act_even", actEven);
					_ruleViolation.SetParam("act_male_nummber", to_string(malCrewNumber));
					return false;
				}
			}
			else {
				if (malCrewNumber % 2 != 0 || femaleCrewNumber % 2 != 0) {
					string actEven = "F" + to_string(femaleCrewNumber) + "：M" + to_string(malCrewNumber);
					_ruleViolation.SetParam("act_even", actEven);
					_ruleViolation.SetParam("act_male_nummber", to_string(malCrewNumber));
					return false;
				}
			}
		}
		
	}
	
	return true;
}

void CheckGenderOnFlightByCompositionForPRRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& rosterId = _ruleViolation.GetParam("roster_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	const auto& actEven = _ruleViolation.GetParam("act_even");
	const auto& actMaleNumber = _ruleViolation.GetParam("act_male_nummber");
	const auto& minLimit = _ruleViolation.GetParam("min_limit");
	const auto& maxLimit = _ruleViolation.GetParam("max_limit");
	const auto& pairingId = _ruleViolation.GetParam("pairing_id");
	const auto& segmentId = _ruleViolation.GetParam("segment_id");
	string msg = "The gender distribution of crew on flight ({0:actEven}) is uneven, or the number of male crew ({1:actMaleNumber}) exceeds the maximum limit ({2:maxLimit}), or is less than minimum ({3:minLimit})";
	msg = StringUtils::Format(msg, actEven, actMaleNumber, maxLimit, minLimit);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (crewId.empty()) {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
		rv->crewId = crewId;
		rv->rosterId = stoll(rosterId);
	}
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->pairingId = stoll(pairingId);
	rv->segmentId = stoll(segmentId);
	_ruleViolation.AddRuleViolations(rv);
}


void CheckGenderOnFlightByCompositionForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckGenderOnFlightByCompositionForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
