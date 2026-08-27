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
#include "utils/DutyUtils.h"

/*
   Pier Solution Limited. 2022/6/12
   EASA 法规 7005
   ORO.FTL.105 Definitions   "Acclimatised",
   ORO.FTL.205 Flight duty perild(FDP): b(1)/b(2)/b(3)
*/

//20200515 ain, mantis#8288, 3007计算航段数忽略返航备降(fltSts=V/R)
//从3007直接拷贝代码，需要重构，避免重复代码。2022/6/18

static int getLangdingNums(Duty* duty, CrewDataContext* dbData) {
	if (!duty) {
		return 0;
	}
	if (duty->getNumSegments() == 0) {
		return 0;
	}
	int num = 0;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		Segment* flt = s;
		if (dbData != nullptr) {
			auto iterFlt = dbData->flightIdMap.find(s->getDBId());
			if (iterFlt != dbData->flightIdMap.end() && iterFlt->second != nullptr) {
				flt = iterFlt->second.get();
			}
		}

		string ass = s->getAssignment();
		if (flt->getFltSts() != "V"
			&& flt->getFltSts() != "R"
			&& s->getIsOperating()) {
			num++;
		}

	}
	return num;
}

std::string DoubleToString(double value)
{
	std::ostringstream stream;
	stream << value;
	return stream.str();
}

bool LegalityChecker::checkEASAMaxFDP(vector<Duty *> duties, const vector<DBRule>& rules)
{
	bool bRet = true;
	if ((rules.size() <= 0) || (duties.size() ==0))
		return bRet;

	//COMPOSITION,REST FACILITY,REF TM START,REF TM END,SECTORS START,SECTORS END,MAX FDP,MAX EXTENSION
	for (auto singleRule : rules)
	{
		auto& parameter = singleRule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;

		string states="*",complement, bunk, landing_lower = "0", landing_upper = "99", max_fdp = "9999", checkin_lower = "00:00", checkin_upper = "23:59", max_extension;
		string strDefinition, strValue;
		vector<string> compositions,accStates;
		int RestFacility = 0;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "COMPOSITION") {
				complement = headeValue;
				transform(complement.begin(), complement.end(), complement.begin(), ::toupper);
				if (complement == "BASIC")
					complement = complement + "|" + "2P";
				split(complement, '|', compositions);
			}
			else if (header == "ACC STATES") {
				states = headeValue;
				transform(states.begin(), states.end(), states.begin(), ::toupper);
				split(states, '|', accStates);
			}
			else if (header == "REST FACILITY") {
				bunk = headeValue;
				if (bunk != "" &&bunk != "*") {
					RestFacility = atoi(bunk.c_str());
				}
			}
			else if (header == "REF TM START") {
				checkin_lower = headeValue;
			}
			else if (header == "REF TM END") {
				checkin_upper = headeValue;
			}
			else if (header == "SECTORS START") {
				landing_lower = headeValue;
			}
			else if (header == "SECTORS END") {
				landing_upper = headeValue;
			}
			else if (header == "MAX FDP") {
				max_fdp = headeValue;
			}
			else  if (header == "MAX EXTENSION")
			{
				max_extension = headeValue;
			}
		}

		int iLandingLow = 0, iLandingUpper = 999, lMaxFDP = 9999, iMaxExtension = 0;//iMaxExtension单位为s
		iLandingLow = stoi(landing_lower);
		iLandingUpper = stoi(landing_upper);
		//lMaxFDP是分钟
		lMaxFDP = stoi(max_fdp.substr(0, max_fdp.find(":"))) * 60 + stoi(max_fdp.substr(max_fdp.find(":") + 1));

		for (std::size_t i = 0; i < duties.size(); i++)
		{

			string state = duties[i]->getAcclimatisedState();
			
			if (states !="*")
				if (std::find(accStates.begin(), accStates.end(), state) == accStates.end())
					continue;

			int segNum = duties[i]->getNumFlySegs();
			time_t checkin = duties[i]->getStartTimeUtcAct();
			long fdp = duties[i]->getFDPInSecs();

			if (bunk != "*")
			{
				int iRestFacility = DutyUtils::GetRestfacility(duties[i], this->_dbData);
				//int iRestFacility = 9999;
				//for (auto& segment : duties[i]->getSegments())
				//{
				//	string tailNumber = segment->getTailNum();
				//	int ii = 0;
				//	if (this->_dbData->fltIdToAircraftMap.find(tailNumber) != this->_dbData->fltIdToAircraftMap.end()) {
				//		DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
				//		if (aircraft->isExistRest) {
				//			ii = aircraft->restFacility;
				//		}
				//	}
				//	else if (this->_dbData->fleetMap.find(segment->getFleetCD()) != this->_dbData->fleetMap.end()) {
				//		FLEET fleet = this->_dbData->fleetMap[segment->getFleetCD()];
				//		if (fleet.restfacility > ii) {
				//			ii = fleet.restfacility;
				//		}
				//	}
				//	if (ii < iRestFacility) iRestFacility = ii;
				//}
				if (iRestFacility != RestFacility) continue;
			}
			int landing = getLangdingNums(duties[i], _dbData.get());

			//long pgId = duties[0]->getPairingId();

			//if (pgId == 12256189 || pgId == 12256190 ||  pgId == -396 || pgId== -408 || pgId == -191)
			//	if ( complement == "*" )
			//		printf("");

			string strComplement = duties[i]->getCompositionName();
			if ((strComplement == "") && (complement != "*"))
				continue;

			/* 20220623 假设检查MAX FDP时配比已经设置正确，无需设置配比。
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = this->getCompositionByDuty(duties[i]);
				duties[i]->setCompositionName(strComplement);
			}
			*/
			
			int refTz = duties[i]->getRefTimeZone();

			int iMaxFDPExtension = 0;

			//CS FTL.1.220 Split Duty Definition
			//(c) The maximum FDP specified in ORO.FTL.205(b) may be increased by up to 50 % of the break.
			if (duties[i]->isSplitDuty())
				iMaxFDPExtension = ( duties[i]->splitDutyDurationInMins ) / 2;

			bool isInRange = Utility::GetInstancePtr()->IsTimesInRange(checkin, refTz, checkin_lower, checkin_upper);

			if (isInRange && (landing <= iLandingUpper && landing >= iLandingLow) && 
				(strComplement == "" || complement == "*" || find(compositions.begin(), compositions.end(), strComplement) != compositions.end())) 
			{
				duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lMaxFDP, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);

				if (fdp > (lMaxFDP + iMaxFDPExtension ) * 60 ) {

					if (this->GetApplication() == PAIRING_OPTIMIZER)
						return false;
					
					//Flight duty period ({actFDP}) is more than the limitation ({maxFDP}), Crew complement ({composition}), Reported time ({checkin-checkout}) at the reported time zone ({refTz}) and state ({state}).
					string errorMsg = "Flight duty period (" + Utility::GetInstancePtr()->formatMinutes(fdp / 60);
					errorMsg += ") is more than the limitation (" + Utility::GetInstancePtr()->formatMinutes(lMaxFDP)
						+ "), Crew complement (" + complement;
					errorMsg += "), Reported time (" + checkin_lower + "-" + checkin_upper + ") ";
					if (iMaxFDPExtension > 0) {
						errorMsg += ", Maximum flight duty period extensiton (" + Utility::GetInstancePtr()->formatMinutes(iMaxFDPExtension) + ") ";
					}
					errorMsg += " at the reported time zone (" + Utility::GetInstancePtr()->iToa(refTz) + ") and state (" + state +").";

					duties[i]->setViolationMessage(errorMsg);
					duties[i]->setLegality(false);
					RULE_VIOLATION* rv = new RULE_VIOLATION();

					rv->pairingId = duties[i]->getPairingId();
					rv->dutySequenceNumber = duties[i]->getDutySegNum();
					rv->idRule = singleRule.idRule;
					rv->startDTUtc = duties[i]->getStartTimeUtcAct();
					rv->endDTUtc = duties[i]->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					//if (roster) {
					//	rv->crewId = roster->idcrew;
					//	rv->rosterId = roster->rosterId;
					//	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//}

					rv->operation_result.insert(pair<string, string>("ruleId", "7005.1"));
					rv->operation_result.insert(pair<string, string>("Act Fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("Max FDP", Utility::GetInstancePtr()->formatMinutes(lMaxFDP)));
					rv->operation_result.insert(pair<string, string>("Complement", complement));
					rv->operation_result.insert(pair<string, string>("Ref TM Start", checkin_lower));
					rv->operation_result.insert(pair<string, string>("Ref TM End", checkin_upper));
					rv->operation_result.insert(pair<string, string>("Ref TM", Utility::GetInstancePtr()->iToa(refTz)));
					rv->operation_result.insert(pair<string, string>("Acc State", duties[i]->getAcclimatisedState()));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					return false;
				}


			}


		}

	}
	return bRet;
}