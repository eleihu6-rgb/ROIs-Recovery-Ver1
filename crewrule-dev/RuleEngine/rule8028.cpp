#pragma once

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "rule/framework/utils/RosterUtils.h"
#include "rule/framework/utils/StringUtils.h"

bool LegalityChecker::checkDutyByCrewNationality(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	rule8028* cache8028 = (rule8028*)singleRule->parsedParam.get();
	vector<string>& strCrewNation = cache8028->crewNationalities;
	vector<string>& fltNums = cache8028->fltNums;
	vector<string>& fltCountries = cache8028->fltCountries;
	vector<string>& fltTypes = cache8028->fltTypes;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	string crewNationality = crew->nationality;
	if (crewNationality.length() == 0) crewNationality = "CN";

	//if (crewNationality != strCrewNation) return true;
	if (strCrewNation.size() > 0 && strCrewNation[0] != "*" && std::find(strCrewNation.begin(), strCrewNation.end(), crewNationality) == strCrewNation.end()) return true;
	string crewid = crew->idCrew;
	string base = crew->getPrimeBase();

	//mantis#2149, 使用 iterator代替 rosterList copy
	//vector<SharedPtr<ROSTER>> rosters;
	auto rosterBeg = crew->rosterList.begin();
	auto rosterEnd = crew->rosterList.end();
	if (this->_application == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0) {
		//rosters.push_back(crew->rosterList[pCrew->RosterIndex]);
		rosterBeg = crew->rosterList.begin() + pCrew->RosterIndex;
		rosterEnd = rosterBeg + 1;
	}
	else {
		//rosters = crew->rosterList;
	}

	vector<SharedPtr<ROSTER>>::iterator iter_roster;

	auto baseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	for (iter_roster = rosterBeg; iter_roster != rosterEnd; iter_roster++)
	{

		if (!(*iter_roster)->needRuleCheck && this->_application == ROSTER_OPTIMIZER){
			continue;
		}

		//if ((*iter_roster)->duty != "FLY" && (*iter_roster)->duty != "MVO" && (*iter_roster)->duty != "SBY" && (*iter_roster)->duty != "EXSBY" && (*iter_roster)->duty != "MVP") continue;

		if (!((*iter_roster)->pairing))
			continue;
		Pairing * pairing = (*iter_roster)->pairing;

		string arr_country, dep_country;
		//mantis#2149, 避免集合拷贝
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++)
		{
			Duty * duty = pairing->getDuty(i);
			Duty::DUTY_TYPE dt = duty->getType();
			if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST)
				continue;

			for (std::size_t j = 0; j < duty->getNumSegments(); j++)
			{
				Segment* segment = duty->getSegment(j);

				string arrstation = segment->getArrStation();
				string depstation = segment->getDepStation();
				arr_country = this->_dbData->findAirportCountry(arrstation);
				dep_country = this->_dbData->findAirportCountry(depstation);

				bool notAllowedFltNum = false, notAllowedDepStation = false, notAllowArrStation = false, notAllowedFltType = false;
				//不允许飞的航班号列表
				if (std::find(fltNums.begin(), fltNums.end(), segment->getSegNumber()) != fltNums.end()) {
					notAllowedFltNum = true;
				}

				//不允许飞的航班起飞国家
				if (std::find(fltCountries.begin(), fltCountries.end(), dep_country) != fltCountries.end()) {
					notAllowedDepStation = true;
				}

				//不允许飞的航班落地国
				if (std::find(fltCountries.begin(), fltCountries.end(), arr_country) != fltCountries.end()) {
					notAllowArrStation = true;
				}

				//不允许飞的航班类型
				if (std::find(fltTypes.begin(), fltTypes.end(), segment->getDomIntType()) != fltTypes.end()) {
					notAllowedFltType = true;
				}

				if (!notAllowedFltNum && !notAllowedDepStation && !notAllowArrStation && !notAllowedFltType) {
					//未违规
					continue;
				}
				
				stringstream ss;
				ss << "Crew (" << crew->nationality << ") cannot operate";
				if (notAllowedFltType) {

					if (segment->getDomIntType() == "I") {
						ss << " the international flight";
					}
					else if (segment->getDomIntType() == "D") {
						ss << " the domestic flight";
					}
					else if (segment->getDomIntType() == "R") {
						ss << " the regional flight";
					}
					else {
						ss << " the flight";
					}
				}
				else {
					ss << " the flight";
				}
				ss << " (" << segment->getAirline() << segment->getFlightNumber() << ")";
				if (notAllowedDepStation) {
					ss << " from " << dep_country;
				}
				if (notAllowArrStation) {
					ss << " to " << arr_country;
				}
				ss << ".";

				this->setLegalityMessage(duty, pCrew, singleRule, ss.str());

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewid;
				rv->rosterId = (*iter_roster)->rosterId;
				rv->pairingId = (*iter_roster)->pairId;
				rv->dutySequenceNumber = duty->getDutySegNum();
				rv->segmentId = segment->getDBId();
				rv->startDTUtc = segment->getStartTimeUtcAct();
				rv->endDTUtc = segment->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
				rv->violation_msg = ss.str();
				rv->operation_result.insert(pair<string, string>("crewNationality", crew->nationality));
				rv->operation_result.insert(pair<string, string>("airline", segment->getAirline()));
				rv->operation_result.insert(pair<string, string>("fltNum", segment->getFlightNumber()));
				rv->operation_result.insert(pair<string, string>("domIntType", segment->getDomIntType()));
				rv->operation_result.insert(pair<string, string>("arrCountry", arr_country));
				rv->operation_result.insert(pair<string, string>("depCountry", dep_country));
				rv->operation_result.insert(pair<string, string>("notAllowedFltNum", notAllowedFltNum ? "Y" : "N"));
				rv->operation_result.insert(pair<string, string>("notAllowedDepStation", notAllowedDepStation ? "Y" : "N"));
				rv->operation_result.insert(pair<string, string>("notAllowArrStation", notAllowArrStation ? "Y" : "N"));
				rv->operation_result.insert(pair<string, string>("notAllowedFltType", notAllowedFltType ? "Y" : "N"));
				this->addRuleViolations(rv, singleRule);
				pCrew->isLegal = false;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
	
		}
	}

	return isValid;
}
