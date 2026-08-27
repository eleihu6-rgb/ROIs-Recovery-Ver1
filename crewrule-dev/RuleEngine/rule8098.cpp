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
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"

bool LegalityChecker::checkMinTakeOffInYDays(RULE_LEGALITY * pCrew, const DBRule* singleRule){
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	vector<string> baseVec, rankVec, crewTeamVec, fleetVec;
	string Route;
	int minLimits = 0;
	int period = 0;
	string unit, type;
	string assignmentsStr;
	vector<string> assignmentVec;
	string flightFleetStr = "*", qualificationStr = "*";
	int takeoffAndLandingNum = 0;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			split(headeValue, '|', baseVec);
		}
		else if (header == "RANKS") {
			split(headeValue, '|', rankVec);
		}
		else if (header == "FLEETS") {
			split(headeValue, '|', fleetVec);
		}
		else if (header == "CREW TEAMS") {
			split(headeValue, '|', crewTeamVec);
		}
		else if (header == "ROUTE") {
			Route = headeValue;
		}
		else if (header == "MIN LIMITS") {
			minLimits = stoi(headeValue);
		}
		else if (header == "PERIOD") {
			period = stoi(headeValue);
		}
		else if (header == "UNIT") {
			unit = headeValue;
		}
		else if (header == "TYPE") {
			type = strToUpper(headeValue);
		}
		else if (header == "ASSIGNMENTS") {
			assignmentsStr = headeValue;
			split(headeValue, '|', assignmentVec);
		}
		else if (header == "TAKEOFF AND LANDING NUMBER") {
			if (headeValue.empty() || headeValue == "*")
				takeoffAndLandingNum = 0;
			else
				takeoffAndLandingNum = stoi(headeValue);
		}
		else if (header == "FLIGHT FLEET") {
			flightFleetStr = headeValue;
		}
		else if (header == "QUAL") {
			qualificationStr = headeValue;
		}
	}

	if (pCrew->crewIndex < 0){ return true; }
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)return true;
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	vector<string> positionsVec;
	split("*", '|', positionsVec);
	bool bRetu = Utility::GetInstancePtr()->isCrewQualified(crew, baseVec, rankVec, fleetVec, crewTeamVec, positionsVec, lCheckedStart, lCheckedEnd);
	if (!bRetu)return true;
	time_t minManday = 99999999999;
	time_t maxManday = -1;
	if (crew->mandayFdList.empty())
		return true;
	for (auto& fd : crew->mandayFdList){
		if (fd->crewDateUtc < minManday){
			minManday = fd->crewDateUtc;
		}
		if (fd->crewDateUtc > maxManday){
			maxManday = fd->crewDateUtc;
		}
	}
	//前缀数组优化速度
	int days = (int)(maxManday - minManday) / (24 * 60 * 60) + 3;

	std::vector<int> mandayFDUpDowns(days, 0), mandayFDCAT2UpDwons(days, 0), mandayFDTakeoff(days, 0), mandayFDLanding(days, 0);
	std::vector<int> mandayFleetLanding(days, 0), mandayNightLanding(days, 0);
	for (auto& fd : crew->mandayFdList) {
		int index = (int)(fd->crewDateUtc - minManday) / (24 * 60 * 60);
		mandayFDUpDowns[index] += fd->updowns;
		mandayFDCAT2UpDwons[index] += fd->cat2Updowns;
		mandayFDTakeoff[index] += fd->takeoff;
		mandayFDLanding[index] += fd->landing;
		if (flightFleetStr != "*" && fd->fleetLanding.find(flightFleetStr) != fd->fleetLanding.end()) {
			mandayFleetLanding[index] += fd->fleetLanding[flightFleetStr];
		}
		else if (flightFleetStr == "*") {
			for (std::map<string, int>::iterator iter = fd->fleetLanding.begin(); iter != fd->fleetLanding.end(); iter++) {
				mandayFleetLanding[index] += iter->second;
			}
		}
		if (flightFleetStr != "*" && fd->nightFleetLanding.find(flightFleetStr) != fd->nightFleetLanding.end()) {
			mandayNightLanding[index] += fd->nightFleetLanding[flightFleetStr];
		}
		else if (flightFleetStr == "*") {
			for (std::map<string, int>::iterator iter = fd->nightFleetLanding.begin(); iter != fd->nightFleetLanding.end(); iter++) {
				mandayNightLanding[index] += iter->second;
			}
		}
	}
	for (int i = 1; i < days; i++) {
		mandayFDUpDowns[i] += mandayFDUpDowns[i - 1];
		mandayFDCAT2UpDwons[i] += mandayFDCAT2UpDwons[i - 1];
		mandayFDTakeoff[i] += mandayFDTakeoff[i - 1];
		mandayFDLanding[i] += mandayFDLanding[i - 1];
		mandayFleetLanding[i] += mandayFleetLanding[i - 1];
		mandayNightLanding[i] += mandayNightLanding[i - 1];

	}

	//Logger::getRuleLogger()->debug("[8098] idCrew={}, minManday={}, period={}", crew->idCrew, minManday, period);

	//stringstream ssDebug;
	//int ssDebugIndex = 0;
	//ssDebug << "crewId: " << crew->idCrew << ", ";
	for (std::size_t i = 0; i < rosters.size(); i++){
		Pairing* p = rosters[i]->pairing;
		if (p == NULL)continue;
		if (assignmentsStr != "*" && find(assignmentVec.begin(), assignmentVec.end(), rosters[i]->qualifier) == assignmentVec.end())
			continue;
		for (std::size_t j = 0; j < p->getNumDuties(); j++) {
			Duty* d = p->getDuty(j);
			for (std::size_t k = 0; k < d->getNumSegments(); k++) {
				Segment* s = d->getSegment(k);

				if (RosterUtils::ExistExceptionCode(rosters[i].get(), s, singleRule->exceptionCodes, _dbData)) {
					continue;
				}

				time_t start = s->getStartTimeUtcAct();
				time_t end = s->getEndTimeUtcAct();
				int isMatch = false;
				if (Route == "*") {
					isMatch = true;
				}
				else {
					for (auto& route : this->_dbData->routeList) {
						if (Route != "*" && route->routeId != stoi(Route))
							continue;
						if (route->arvArp != "" && route->arvArp != s->getArrStation())
							continue;
						if (route->depArp != "" && route->depArp != s->getDepStation())
							continue;
						if (route->fltNum != "" && route->fltNum != s->getFlightNumber())
							continue;
						if (route->segType != "" && route->segType != "*" && route->segType.find(s->getDomIntType()) == std::string::npos)
							continue;
						isMatch = true;
						break;
					}
				}
				bool isMatchFleet = false;
				if (flightFleetStr == "*" || s->getFleetCD() == flightFleetStr) {
					isMatchFleet = true;
				}
				int upDownsNumber, CAT2UpDwonsNumber, takeoffNumber, landingNumber;
				int checkEnd = static_cast<int>(s->getStartTimeUtcAct() - minManday) / (24 * 60 * 60);
				int checkStart = static_cast<int>(s->getStartTimeUtcAct() - minManday) / (24 * 60 * 60) - period;

				time_t checkStartTimeUtc = minManday + (time_t)(checkStart + 1) * 24 * 60 * 60;
				time_t checkEndTimeUtc = minManday + (time_t)checkEnd * 24 * 60 * 60 + 86400 - 1;

				//ssDebugIndex++;
				//ssDebug << "[checkEnd: " << to_string(checkEnd) << ", checkStart: " + to_string(checkStart) + "],";
				//if (ssDebugIndex % 5 == 0) {
				//	ssDebug << std::endl;
				//}
				if (checkStart > (int)mandayFDUpDowns.size() - 1 || checkEnd > (int)mandayFDUpDowns.size() - 1)
					continue;
				if (checkStart < 0) checkStart = 0;
				if (isMatch && isMatchFleet){
					if (qualificationStr != "*") {
						bool hasQual = false;
						const auto& crewQualifications = crew->qualificationList;
						for (const auto& qual : crewQualifications) {
							if (qual->qual == qualificationStr) {
								time_t qualStart = qual->issuedUtc;
								time_t qualEnd = qual->expiryUtc;
								if (qualEnd < 0)
									qualEnd = end + 24 * 3600;
								if (qual->expiryUtc && qualStart <= start && qualEnd >= end && qual->isValid) {
									hasQual = true;
									break;
								}
							}
						}
						if (hasQual)
							continue;
					}
					if (unit == "CD"){
						if (type == "UPDOWNS"){
							if (s->getStartTimeUtcAct() < minManday)upDownsNumber = 0;
							else{
								upDownsNumber = mandayFDUpDowns[checkEnd] - mandayFDUpDowns[checkStart];
							}
							if (upDownsNumber < minLimits){
								bReturn = false;
								string errorMsg = "The CAT I landing/take-off count ({0:upDownsNumber}) falls short of the required minimum {1:minLimits} for the {2:period} {3:unit} period until {4:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, upDownsNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
						}
						else if (type == "CAT2UPDOWNS"){
							if (s->getStartTimeUtcAct() < minManday)CAT2UpDwonsNumber = 0;
							else{
								CAT2UpDwonsNumber = mandayFDCAT2UpDwons[checkEnd] - mandayFDCAT2UpDwons[checkStart];
							}

							if (CAT2UpDwonsNumber < minLimits){
								bReturn = false;
								string errorMsg = "The CAT II landing/take-off count ({0:CAT2UpDwonsNumber}) falls short of the required minimumt {1:minLimits} for the {2:period} {3:unit} period until {4:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, CAT2UpDwonsNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
						}
						else if (type == "TAKEOFF") {
							if (s->getStartTimeUtcAct() < minManday) takeoffNumber = 0;
							else {
								takeoffNumber = mandayFDTakeoff[checkEnd] - mandayFDTakeoff[checkStart];
							}
							if (takeoffNumber < minLimits) {
								bReturn = false;
								string errorMsg = "The take-off count ({0:takeoffNumber}) falls short of the required minimum {1:minLimits} for the {2:period} {3:unit} period until {4:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, takeoffNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
						}
						else if (type == "LANDING") {
							if (s->getStartTimeUtcAct() < minManday) landingNumber = 0;
							else {
								landingNumber = mandayFDLanding[checkEnd] - mandayFDLanding[checkStart];
							}
							if (landingNumber < minLimits) {
								bReturn = false;
								string errorMsg = "The landing count ({0:landingNumber}) falls short of the required minimum {1:minLimits} for the {2:period} {3:unit} period until {4:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, landingNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
						}
						else if (type == "TAKEOFF OR LANDING") {
							if (s->getStartTimeUtcAct() < minManday) { landingNumber = 0; takeoffNumber = 0; }
							else {
								landingNumber = mandayFDLanding[checkEnd] - mandayFDLanding[checkStart];
								takeoffNumber = mandayFDTakeoff[checkEnd] - mandayFDTakeoff[checkStart];

							}
							if (landingNumber < minLimits && takeoffNumber < minLimits) {
								bReturn = false;
								string errorMsg = "The landing/take-off count ({0:landingNumber}/{1:takeoffNumber}) falls short of the required minimum {2:minLimits} for the {3:period} {4:unit} period until {5:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, landingNumber, takeoffNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
						}
						else if (type == "FLEET LANDING" && flightFleetStr != "*") {
							if (s->getStartTimeUtcAct() < minManday) landingNumber = 0;
							else {
								landingNumber = mandayFleetLanding[checkEnd] - mandayFleetLanding[checkStart];
							}
							if (landingNumber < minLimits) {
								bReturn = false;
								string errorMsg = "The {0:flightFleetStr} landing count ({1:landingNumber}) falls short of the required minimum {2:minLimits} for the {3:period} {4:unit} period until {5:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, flightFleetStr, landingNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
						}
						else if (type == "NIGHT LANDING") {
							if (s->getStartTimeUtcAct() < minManday) landingNumber = 0;
							else {
								landingNumber = mandayNightLanding[checkEnd] - mandayNightLanding[checkStart];
							}
							if (landingNumber < minLimits) {
								bReturn = false;
								string errorMsg = "The {0:flightFleetStr} night landing count ({1:landingNumber}) falls short of the required minimum {2:minLimits} for the {3:period} {4:unit} period until {5:flightStartTimeLocAct}.";
								errorMsg = StringUtils::Format(errorMsg, flightFleetStr, landingNumber, minLimits, period, unit, utcToUtcString(s->getStartTimeLocAct()));

								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = rosters[i]->idcrew;
								rv->pairingId = s->getPairingId();
								rv->dutySequenceNumber = s->getDutySeq();
								rv->segmentId = s->getDBId();
								rv->startDTUtc = checkStartTimeUtc;
								rv->endDTUtc = checkEndTimeUtc;
								rv->violation_msg = errorMsg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								this->addRuleViolations(rv, singleRule);
							}
							}
					}
				}
			}
		}
	}
	//Logger::getRuleLogger()->debug("[8098] {}", ssDebug.str());
	return bReturn;
};