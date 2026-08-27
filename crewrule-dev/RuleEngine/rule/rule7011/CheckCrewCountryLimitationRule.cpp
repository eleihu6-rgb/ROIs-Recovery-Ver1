#include "CheckCrewCountryLimitationRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>

#include "CrewDB.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CheckCrewCountryLimitationRuleParam.h"

#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"


//按crew检查
bool CheckCrewCountryLimitationRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool isValid = true;
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

	const auto & crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	
	_ruleViolation.SetParam("crew_id", crew->idCrew);
	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;
		_ruleViolation.SetRuleParam(ruleParam);
		// 国籍判断
		string crewNationality = ruleParam._crewNationality;
		if (crewNationality != crew->nationality)
			continue;

		const auto & countryList = ruleParam._countries;

		const auto & crewQuals = crew->qualificationList;
		const auto & quals = ruleParam._quals;
		
		for (std::size_t i = 0; i < rosters.size(); i++) {
			bool hasQual = false;
			time_t qualEnd = 0;

			if (this->_application == ROSTER_OPTIMIZER && rosters[i]->source == "PA")
				continue;

			if (!rosters[i]->pairing)
				continue;

			time_t start = rosters[i]->getStartTimeLocAct();
			time_t end = rosters[i]->getEndTimeLocAct();
			if (!(quals.empty() || quals[0] == "*")) {
				for (auto& qual : crewQuals)
				{
					qualEnd = qual->expiryUtc;
					if (qualEnd < 0)
						qualEnd = end + 24 * 3600;
					if (find(quals.begin(), quals.end(), qual->qual) != quals.end() && (qual->issuedUtc <= start) && (qualEnd >= end))
					{
						if (!hasQual)
						{
							hasQual = true;
							break;
						}
					}

				}
			}
			


			const auto & pairing = rosters[i]->pairing;
			for (const auto & duty : pairing->getDutyVec()) {
				for (const auto & seg : duty->getSegments()) {
					string dep = seg->getDepStation();
					string depCountry = this->_dbData->findAirportCountry(dep);
					if (find(countryList.begin(), countryList.end(), depCountry) != countryList.end() && (quals.empty() || quals[0] == "*" || !hasQual)) {
						_ruleViolation.SetParam("country", depCountry);
						_ruleViolation.SetParam("roster_id", to_string(rosters[i]->rosterId));
						_ruleViolation.SetParam("start", to_string(rosters[i]->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(rosters[i]->getRestStartUtcAct()));
						_ruleViolation.SetParam("pairing_id", to_string(rosters[i]->pairId));
						_ruleViolation.SetParam("dutySeqNum", to_string(duty->getDutySegNum()));
						_ruleViolation.SetParam("segment_id", to_string(seg->getDBId()));
						ThrowRuleViolation();
						isValid = false;
						if (this->_application == ROSTER_OPTIMIZER)
							return isValid;
					}
					string arv = seg->getArrStation();
					string arvCountry = this->_dbData->findAirportCountry(arv);
					if (find(countryList.begin(), countryList.end(), arvCountry) != countryList.end() && (quals.empty() || quals[0] == "*" || !hasQual)) {
						_ruleViolation.SetParam("country", arvCountry);
						_ruleViolation.SetParam("roster_id", to_string(rosters[i]->rosterId));
						_ruleViolation.SetParam("start", to_string(rosters[i]->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(rosters[i]->getRestStartUtcAct()));
						_ruleViolation.SetParam("pairing_id", to_string(rosters[i]->pairId));
						_ruleViolation.SetParam("dutySeqNum", to_string(duty->getDutySegNum()));
						_ruleViolation.SetParam("segment_id", to_string(seg->getDBId()));
						ThrowRuleViolation();
						isValid = false;
						if (this->_application == ROSTER_OPTIMIZER)
							return isValid;
					}
				}
			}

			
		}
	}

	return isValid;
}

// for RO
bool CheckCrewCountryLimitationRule::CheckRuleForPairing(SharedPtr<CREW> crew, Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return true;
	}

	bool isValid = true;

	time_t checkedStartTime = 0, checkedEndTime = 0;
	
	checkedStartTime = this->_dbData->scenario.startDtUTC;
	checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;

		// 国籍判断
		string crewNationality = ruleParam._crewNationality;
		if (crewNationality != crew->nationality)
			continue;

		const auto& countryList = ruleParam._countries;

		const auto& crewQuals = crew->qualificationList;
		const auto& quals = ruleParam._quals;

		bool hasQual = false;
		time_t qualStart = 0;
		time_t qualEnd = 0;

		time_t start = pairing->getStartTimeLocAct();
		time_t end = pairing->getEndTimeLocAct();
		if (!(quals.empty() || quals[0] == "*")) {
			auto qualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(crew, this->_dbData->qualExtensionConfigMap);
			for (auto& qual : crewQuals)
			{
				qualStart = qual->issuedUtc;
				qualEnd = qual->expiryUtc;
				if (qualEnd < 0)
					qualEnd = end + 24 * 3600;
				if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
					auto qualPeriod = RosterUtils::GetQualExtension(qual, qualExtensionConfigsForQualMap);
					qualStart = std::get<0>(qualPeriod);
					qualEnd = std::get<1>(qualPeriod);
				}
				if (find(quals.begin(), quals.end(), qual->qual) != quals.end() && (qualStart <= start) && (qualEnd >= end))
				{
					if (!hasQual)
					{
						hasQual = true;
						break;
					}
				}

			}
		}

		for (const auto& duty : pairing->getDutyVec()) {
			for (const auto& seg : duty->getSegments()) {
				string dep = seg->getDepStation();
				string depCountry = this->_dbData->findAirportCountry(dep);
				if (find(countryList.begin(), countryList.end(), depCountry) != countryList.end() && (quals.empty() || quals[0] == "*" || !hasQual)) {
					return false;
				}
				string arv = seg->getArrStation();
				string arvCountry = this->_dbData->findAirportCountry(arv);
				if (find(countryList.begin(), countryList.end(), arvCountry) != countryList.end() && (quals.empty() || quals[0] == "*" || !hasQual)) {
					return false;
				}
			}
		}


	}

	return isValid;
}

void CheckCrewCountryLimitationRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckCrewCountryLimitationRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}




void CheckCrewCountryLimitationRule::ThrowRuleViolation() const {
	string errorMsg = "Crew {0:crew_id} cannot fly to country {1:country}.";
	errorMsg = StringUtils::Format(errorMsg, _ruleViolation.GetParam("crew_id"), _ruleViolation.GetParam("country"));

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->violation_msg = errorMsg;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->pairingId = stoll(_ruleViolation.GetParam("pairing_id"));
	rv->dutySequenceNumber = stoi(_ruleViolation.GetParam("dutySeqNum"));
	rv->segmentId = stoll(_ruleViolation.GetParam("segment_id"));
	rv->rosterId = StringUtils::stoll (_ruleViolation.GetParam("roster_id"), 0);
	rv->idRule = _ruleParams[0].GetId();
	rv->description = _ruleParams[0].GetDescription();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}