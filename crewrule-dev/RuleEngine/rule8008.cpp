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



bool LegalityChecker::checkTravelDocByPairing(SharedPtr<CREW> crew, Pairing* pairing, const DBRule* singleRule)
{
	map<string, string> parameter = singleRule->params;
	string crewNationality = crew->nationality;
	if (crewNationality.length() == 0) crewNationality = "CN";

	if (parameter.size() == 0)
		return true;

	bool isValid = true;

	int iNumber = 0;
	int iDays = 0;
	bool bOnlyCheckLO = false;
	string  strTypes, strUnit, strFlightNums = "*", strCheckOn = "S", strFlightFlag = "*", strRosterFlightAssignments = "*";;
	vector<string> strCrewNation, strDest, strDept, exceptionCrewNation, airports, rosterFlightAssignments;
	//mantis#2149, 从预处理rule中直接提取解析结果
	rule8008* cache8008 = (rule8008*)singleRule->parsedParam.get();
	iDays = cache8008->days;
	strDest = cache8008->dest;
	strDept = cache8008->dept;
	iNumber = cache8008->number;
	strCheckOn = cache8008->checkonType;
	bOnlyCheckLO = cache8008->onlyCheckLo;
	strCrewNation = cache8008->strCrewNation;
	exceptionCrewNation = cache8008->exceptionCrewNation;
	strTypes = cache8008->types;
	strUnit = cache8008->unit;
	strFlightNums = cache8008->strFltNums;
	map<string, bool>& mFltNums = cache8008->mFltNums;
	map<string, bool>& mDocs = cache8008->mDocs;
	airports = cache8008->airports;
	strFlightFlag = cache8008->flightFlag;
	strRosterFlightAssignments = cache8008->rosterFlightAssignments;
	split(strRosterFlightAssignments, '|', rosterFlightAssignments);

	vector<SharedPtr<CREW_QUALIFICATION>> filterQual;
	auto qualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(crew, this->_dbData->qualExtensionConfigMap);
	for (auto& iter : crew->qualificationList) {

		if (mDocs.find(iter->qual) != mDocs.end()) {
			if (iter->expiryUtc < 0 || iter->expiryUtc == NULL)
				iter->expiryUtc = time(NULL) + 2 * 365 * 24 * 60 * 60;
			filterQual.push_back(iter);
		}
	}

	if (bOnlyCheckLO && pairing->getNumDuties() == 1)
		return true;

	//if (crewNationality != strCrewNation) return true;
	if (strCrewNation.size() > 0 && strCrewNation[0] != "*" && std::find(strCrewNation.begin(), strCrewNation.end(), crewNationality) == strCrewNation.end())
		return true;

	if (exceptionCrewNation.size() > 0 && exceptionCrewNation[0] != "*" && std::find(exceptionCrewNation.begin(), exceptionCrewNation.end(), crewNationality) != exceptionCrewNation.end())
		return true;

	for (std::size_t i = 0; i < pairing->getNumDuties(); i++)
	{
		Duty * duty = pairing->getDuty(i);
		Duty::DUTY_TYPE dt = duty->getType();
		if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST)
			continue;
		for (std::size_t j = 0; j < duty->getNumSegments(); j++)
		{
			Segment * segment = duty->getSegment(j);
			if (strFlightNums != "*")
			{
				if (mFltNums.find(segment->getSegNumber()) == mFltNums.end())
					continue;
			}
			string arrstation = segment->getArrStation();
			string depstation = segment->getDepStation();

			if (!airports.empty() && airports[0] != "*"
				&& find(airports.begin(), airports.end(), arrstation) == airports.end()
				&& find(airports.begin(), airports.end(), depstation) == airports.end())
				continue;

			string arr_country = this->_dbData->findAirportCountry(arrstation);
			string dep_country = this->_dbData->findAirportCountry(depstation);

			if (arr_country == crewNationality && strDest[0] == "*")
				continue;

			if (!strFlightFlag.empty() && strFlightFlag != "*") {
				if (segment->getFlightFlag() != strFlightFlag)
					continue;
			}

			if (!strRosterFlightAssignments.empty() && strRosterFlightAssignments != "*") {
				const auto& rf = this->_dbData->rosterFlightMgr.get(segment->getDBId(), crew->idCrew);
				if (!rf || find(rosterFlightAssignments.begin(), rosterFlightAssignments.end(), rf->assignment) == rosterFlightAssignments.end())
					continue;
			}


			time_t lEffective = segment->getEndTimeUtcAct();
			if (std::find(strDept.begin(), strDept.end(), dep_country) == strDept.end() && strDept[0] != "*")
				continue;

			if (std::find(strDest.begin(), strDest.end(), arr_country) == strDest.end() && strDest[0] != "*")
				continue;

			if (strCheckOn == "D")
			{
				lEffective = duty->getEndTimeUtcAct();
			}
			else if (strCheckOn == "P")
				lEffective = pairing->getEndTimeUtcAct();

			bool bFound = false;

			for (auto& iter : filterQual)
			{
				auto effTime = iter->issuedUtc;
				auto expTime = iter->expiryUtc;
				if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
					auto qualPeriod = RosterUtils::GetQualExtension(iter, qualExtensionConfigsForQualMap);
					effTime = std::get<0>(qualPeriod);
					expTime = std::get<1>(qualPeriod);
				}
				if (expTime - iDays * 24 * 60 * 60 > lEffective && effTime < segment->getStartTimeUtcAct())
					bFound = true;
			}

			if (!bFound)
				isValid = false;
		}
	}
	return isValid;
}





bool LegalityChecker::checkTravelDocument(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	int iNumber = 0;
	int iDays = 0;
	bool bOnlyCheckLO = false;
	string strTypes, strUnit, strFlightNums = "*", strCheckOn = "S", strFlightFlag = "*", strRosterFlightAssignments = "*", strCheckCtaMcl = "*";
	vector<string> strCrewNation, strDest, strDept, exceptionCrewNation, airports, rosterFlightAssignments, ignoreCertificatesForCtaMcl;
	//mantis#2149, 从预处理rule中直接提取解析结果
	rule8008* cache8008 = (rule8008*)singleRule->parsedParam.get();
	iDays = cache8008->days;
	strDest = cache8008->dest;
	strDept = cache8008->dept;
	iNumber = cache8008->number;
	bOnlyCheckLO = cache8008->onlyCheckLo;
	strCheckOn = cache8008->checkonType;

	strCrewNation = cache8008->strCrewNation;
	exceptionCrewNation = cache8008->exceptionCrewNation;
	strTypes = cache8008->types;
	strUnit = cache8008->unit;
	strFlightNums = cache8008->strFltNums;
	map<string, bool>& mFltNums = cache8008->mFltNums;
	map<string, bool>& mDocs = cache8008->mDocs;
	auto& notCheckCountries = cache8008->notCheckCountries;
	airports = cache8008->airports;
	strFlightFlag = cache8008->flightFlag;
	strRosterFlightAssignments = cache8008->rosterFlightAssignments;
	split(strRosterFlightAssignments, '|', rosterFlightAssignments);
	strCheckCtaMcl = cache8008->checkCtaOrMcl;
	ignoreCertificatesForCtaMcl = cache8008->ignoreCertificatesForCtaOrMcl;
	if (iNumber == 0) return true;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	string crewNationality = crew->nationality;
	if (crewNationality.length() == 0) crewNationality = "CN";

	//if (crewNationality != strCrewNation) return true;
	if (strCrewNation.size() > 0 && strCrewNation[0] != "*" && std::find(strCrewNation.begin(), strCrewNation.end(), crewNationality) == strCrewNation.end()) return true;
	if (exceptionCrewNation.size() > 0 && exceptionCrewNation[0] != "*" && std::find(exceptionCrewNation.begin(), exceptionCrewNation.end(), crewNationality) != exceptionCrewNation.end()) return true;
	string crewid = crew->idCrew;
	string base = crew->getPrimeBase();

	//mantis#2149, 使用 iterator代替 rosterList copy
	vector<SharedPtr<ROSTER>> rosters;
	if (this->_application == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0) {
		if (_dbData->qualExtensionConfigMap.empty()) {
			rosters.push_back(crew->rosterList[pCrew->RosterIndex]);
		}
		else {
			rosters = RosterUtils::FilterRostersByQualExtension(pCrew->RosterIndex, crew, this->_dbData);
		}
	}
	else {
		rosters = crew->rosterList;
	}

	if (rosters.empty()) {
		return true;
	}

	vector<SharedPtr<CREW_QUALIFICATION>> filterQual;
	vector<SharedPtr<CREW_QUALIFICATION>>& qualifications = crew->qualificationList;

	auto baseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	for (auto& iter : qualifications)
	{
		//if (std::find(vDocs.begin(), vDocs.end(), iter->qual) != vDocs.end())
		if (mDocs.find(iter->qual) != mDocs.end())
		{
			if (iter->expiryUtc < 0 || iter->expiryUtc == NULL)
				iter->expiryUtc = time(NULL) + 2 * 365 * 24 * 60 * 60;
			if (iter->invaildUtc < 0 || iter->invaildUtc == NULL)
				iter->invaildUtc = time(NULL) + 2 * 365 * 24 * 60 * 60;

			filterQual.push_back(iter);
		}
	}

	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (auto iter_roster = rosters.begin(); iter_roster != rosters.end(); ++iter_roster)
	{
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs((*iter_roster).get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		if (!(*iter_roster)->needRuleCheck && this->_application == ROSTER_OPTIMIZER){
			continue;
			//cout << "No need to check rule" << endl;
		}
		//20190909 yuankai.cai mantis#6634 检查新增mvo   //TODO:稍后加参数控制
		if ((*iter_roster)->duty != "FLY" && (*iter_roster)->duty != "MVO" && (*iter_roster)->duty != "SBY" && (*iter_roster)->duty != "EXSBY" && (*iter_roster)->duty != "MVP") continue;

		if (!((*iter_roster)->pairing))
			continue;
		Pairing * pairing = (*iter_roster)->pairing;

		//EVA logic for layover[as long as duties size >1, must have layover]
		if (bOnlyCheckLO && pairing->getNumDuties() == 1)
			continue;
		string arr_country, dep_country, seg_fltNum;
		//mantis#2149, 避免集合拷贝
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++)
		{
			Duty * duty = pairing->getDuty(i);
			Duty::DUTY_TYPE dt = duty->getType();
			if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST)
				continue;
			//mantis#2149, 避免集合拷贝
			bool isPairingError = false;
			for (std::size_t j = 0; j < duty->getNumSegments(); j++)
			{
				Segment * segment = duty->getSegment(j);

				//if (crew->idCrew == "F57896" && (segment->getArrStation() == "LAX" || segment->getArrStation()=="LAX" 
				//	|| (*iter_roster)->pairId == 2698524))
				//	printf("");
				string arrstation = segment->getArrStation();
				string depstation = segment->getDepStation();


				if (!airports.empty() && airports[0] != "*"
					&& find(airports.begin(), airports.end(), arrstation) == airports.end()
					&& find(airports.begin(), airports.end(), depstation) == airports.end())
					continue;

				arr_country = this->_dbData->findAirportCountry(arrstation);
				dep_country = this->_dbData->findAirportCountry(depstation);

				//if (dep_country == crewNationality &&
				//	dep_country == this->_dbData->findAirportCountry(segment->getDepStation())
				//	&& strDest[0] == "*"
				//	)
				//	continue;

				if (!strFlightFlag.empty() && strFlightFlag != "*") {
					if (segment->getFlightFlag() != strFlightFlag)
						continue;
				}

				if (!strRosterFlightAssignments.empty() && strRosterFlightAssignments != "*") {
					const auto & rf = this->_dbData->rosterFlightMgr.get(segment->getDBId(), crew->idCrew);
					if (!rf || find(rosterFlightAssignments.begin(), rosterFlightAssignments.end(), rf->assignment) == rosterFlightAssignments.end())
						continue;
				}

				if (strFlightNums != "*")
				{
					//mantis#2149, segment.fltNum匹配改为map
					//if (find(vFltNums.begin(), vFltNums.end(), segment->getSegNumber()) == vFltNums.end())
					if (mFltNums.find(segment->getSegNumber()) == mFltNums.end())
						continue;
				}

				if (std::find(strDest.begin(), strDest.end(), arr_country) == strDest.end() && strDest[0] != "*")continue;
				if (std::find(strDept.begin(), strDept.end(), dep_country) == strDept.end() && strDept[0] != "*")continue;

				if (std::find(notCheckCountries.begin(), notCheckCountries.end(), arr_country) != notCheckCountries.end()
					&& std::find(notCheckCountries.begin(), notCheckCountries.end(), dep_country) != notCheckCountries.end()) continue;

				time_t lEffective = segment->getEndTimeUtcAct();
				if (strCheckOn == "D")
					lEffective = duty->getEndTimeUtcAct();
				else if (strCheckOn == "P")
					lEffective = (*iter_roster)->actRestStrUtc;

				bool bFound = false;
				bool isExp = false; // 给界面提供提示信息
				bool isInValid = false; // 给界面提供提示信息
				bool isNoFound = true; // 给界面提供提示信息
				time_t expTime = 0; // 记录过期时间
				string expQual;//记录过期资质
				for (auto& iter : filterQual)
				{
					isNoFound = false;
					if (!iter->isValid) {
						isInValid = true;
						continue;
					}
					isInValid = false;
					isExp = false;
					time_t eff = iter->issuedUtc;
					time_t exp = iter->expiryUtc;
					time_t invalidTime = iter->invaildUtc;
					//对于EVA来说，CREW QUALIFICATION 是基于TPE而不是CREW BASE时区。特殊处理
					//20190323 ain, mantis#5205, eva特殊逻辑 TPE gap统一放入 airline==BR分支, 避免相互影响
					if (this->_dbData->scenario.airline == "BR") {
						auto gapMinutes = this->_dbData->getAirportOffsetMinutes("TPE") - baseOffsetMinutes;
						exp = exp - gapMinutes * 60;
					}
					if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
						auto qualPeriod = RosterUtils::GetQualExtension(iter, qualExtensionConfigsForQualMap);
						eff = std::get<0>(qualPeriod);
						exp = std::get<1>(qualPeriod);
					}
					if (exp - iDays * 24 * 60 * 60 > lEffective && invalidTime >= segment->getEndTimeUtcAct() && eff < segment->getStartTimeUtcAct()) {
						bFound = true;
						break;
					}
					isExp = true;
					expTime = exp;
					expQual = iter->qual;
				}

				if (!bFound)
				{
					isValid = false;
					//mantis#2149, 拼接str避免生成临时对象
					//"Actual duration ({0:actualDuration}) is more than the maximum duration ({1:maxDuration})"
					std::string message = "";
					if (expTime <= 0) {
						message = "Crew({0:crewId}) doesn't have the valid certificate ({1:qual}).";
						message = StringUtils::Format(message, crew->idCrew, expQual.empty() ? strTypes : expQual);
					}
					else {
						message = "Crew({0:crewId}) doesn't have the valid certificate ({1:qual}), the expiry date is {2:expDate}.";
						message = StringUtils::Format(message, crew->idCrew, expQual.empty() ? strTypes : expQual, utcToUtcDtString(expTime));
					}

					this->setLegalityMessage(duty, pCrew, singleRule, message);

					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = crewid;
					rv->rosterId = (*iter_roster)->rosterId;
					rv->pairingId = (*iter_roster)->pairId;
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->segmentId = segment->getDBId();
					if (strCheckOn == "P")
					{
						rv->startDTUtc = (*iter_roster)->getStartTimeUtcAct();
						rv->endDTUtc = (*iter_roster)->getRestStartUtcAct();
					}
					else if (strCheckOn == "D")
					{
						rv->startDTUtc = duty->getStartTimeUtcAct();
						rv->endDTUtc = duty->getEndTimeUtcAct();
					}
					else
					{
						rv->startDTUtc = segment->getStartTimeUtcAct();
						rv->endDTUtc = segment->getEndTimeUtcAct();
					}
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					rv->violation_msg = message;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "8008.1"));
					rv->operation_result.insert(pair<string, string>("strTypes", strTypes));
					rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
					rv->operation_result.insert(pair<string, string>("status", isNoFound ? "Not Found" : isInValid ? "Invalid" : isExp ? "Eff" : ""));
					if (isExp) {
						rv->operation_result.insert(pair<string, string>("expTime", utcToUtcDtString(expTime)));
						rv->operation_result.insert(pair<string, string>("expQual", expQual));
					}
						
					
					this->addRuleViolations(rv, singleRule);
					pCrew->isLegal = false;
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}

					if (strCheckOn == "D")
						break;
					else if (strCheckOn == "P")
					{
						isPairingError = true;
						break;
					}
				}
				else if (strCheckCtaMcl == "CTA") {
					bool foundCta = false;
					SharedPtr<CREW_QUALIFICATION> qual;
					for (auto& iter : filterQual)
					{
						bool isIgnore = false;
						if (!iter->isValid) {
							isInValid = true;
							continue;
						}

						if (!ignoreCertificatesForCtaMcl.empty() && ignoreCertificatesForCtaMcl[0] != "*" && !ignoreCertificatesForCtaMcl[0].empty()
							&& find(ignoreCertificatesForCtaMcl.begin(), ignoreCertificatesForCtaMcl.end(), iter->qual) != ignoreCertificatesForCtaMcl.end())
							isIgnore = true;

						time_t eff = iter->issuedUtc;
						time_t exp = iter->expiryUtc;
						time_t invalidTime = iter->invaildUtc;

						if (exp - iDays * 24 * 60 * 60 > lEffective && invalidTime >= segment->getEndTimeUtcAct() && eff < segment->getStartTimeUtcAct()) {
							if (iter->isCtaSend || isIgnore) {
								foundCta = true;
								qual = iter;
								break;
							}
						}

					}
					if (!foundCta) {
						isValid = false;
						//mantis#2149, 拼接str避免生成临时对象
						std::string message = "Crew certificate ({0:certificateName}) has not been registered through {1:CatOrMCL}.";
						message = StringUtils::Format(message, strTypes, strCheckCtaMcl);

						this->setLegalityMessage(duty, pCrew, singleRule, message);

						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crewid;
						rv->rosterId = (*iter_roster)->rosterId;
						rv->pairingId = (*iter_roster)->pairId;
						rv->dutySequenceNumber = duty->getDutySegNum();
						rv->segmentId = segment->getDBId();
						if (strCheckOn == "P")
						{
							rv->startDTUtc = (*iter_roster)->getStartTimeUtcAct();
							rv->endDTUtc = (*iter_roster)->getRestStartUtcAct();
						}
						else if (strCheckOn == "D")
						{
							rv->startDTUtc = duty->getStartTimeUtcAct();
							rv->endDTUtc = duty->getEndTimeUtcAct();
						}
						else
						{
							rv->startDTUtc = segment->getStartTimeUtcAct();
							rv->endDTUtc = segment->getEndTimeUtcAct();
						}
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						rv->violation_msg = message;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("ruleId", "8008.2"));
						rv->operation_result.insert(pair<string, string>("strTypes", strTypes));
						rv->operation_result.insert(pair<string, string>("CatOrMCL", strCheckCtaMcl));
						rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
						rv->operation_result.insert(pair<string, string>("status", isNoFound ? "Not Found" : isInValid ? "Invalid" : isExp ? "Eff" : ""));
						if (isExp) {
							rv->operation_result.insert(pair<string, string>("expTime", utcToUtcDtString(expTime)));
							rv->operation_result.insert(pair<string, string>("expQual", expQual));
						}


						this->addRuleViolations(rv, singleRule);
						pCrew->isLegal = false;
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}

						if (strCheckOn == "D")
							break;
						else if (strCheckOn == "P")
						{
							isPairingError = true;
							break;
						}
					}
				}
				else if (strCheckCtaMcl == "MCL") {
					bool foundMcl = false;
					SharedPtr<CREW_QUALIFICATION> qual;
					for (auto& iter : filterQual)
					{
						bool isIgnore = false;
						if (!iter->isValid) {
							isInValid = true;
							continue;
						}

						if (!ignoreCertificatesForCtaMcl.empty() && ignoreCertificatesForCtaMcl[0] != "*" && !ignoreCertificatesForCtaMcl[0].empty()
							&& find(ignoreCertificatesForCtaMcl.begin(), ignoreCertificatesForCtaMcl.end(), iter->qual) != ignoreCertificatesForCtaMcl.end())
							isIgnore = true;

						time_t eff = iter->issuedUtc;
						time_t exp = iter->expiryUtc;
						time_t invalidTime = iter->invaildUtc;

						if (exp - iDays * 24 * 60 * 60 > lEffective && invalidTime >= segment->getEndTimeUtcAct() && eff < segment->getStartTimeUtcAct()) {
							if (iter->isMclSend || isIgnore) {
								foundMcl = true;
								qual = iter;
								break;
							}
						}

					}
					if (!foundMcl) {
						isValid = false;
						//mantis#2149, 拼接str避免生成临时对象
						std::string message = "Crew certificate ({0:certificateName}) has not been registered through {1:CatOrMCL}.";
						message = StringUtils::Format(message, strTypes, strCheckCtaMcl);

						this->setLegalityMessage(duty, pCrew, singleRule, message);

						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crewid;
						rv->rosterId = (*iter_roster)->rosterId;
						rv->pairingId = (*iter_roster)->pairId;
						rv->dutySequenceNumber = duty->getDutySegNum();
						rv->segmentId = segment->getDBId();
						if (strCheckOn == "P")
						{
							rv->startDTUtc = (*iter_roster)->getStartTimeUtcAct();
							rv->endDTUtc = (*iter_roster)->getRestStartUtcAct();
						}
						else if (strCheckOn == "D")
						{
							rv->startDTUtc = duty->getStartTimeUtcAct();
							rv->endDTUtc = duty->getEndTimeUtcAct();
						}
						else
						{
							rv->startDTUtc = segment->getStartTimeUtcAct();
							rv->endDTUtc = segment->getEndTimeUtcAct();
						}
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						rv->violation_msg = message;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("ruleId", "8008.2"));
						rv->operation_result.insert(pair<string, string>("strTypes", strTypes));
						rv->operation_result.insert(pair<string, string>("CatOrMCL", strCheckCtaMcl));						
						rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
						rv->operation_result.insert(pair<string, string>("status", isNoFound ? "Not Found" : isInValid ? "Invalid" : isExp ? "Eff" : ""));
						if (isExp) {
							rv->operation_result.insert(pair<string, string>("expTime", utcToUtcDtString(expTime)));
							rv->operation_result.insert(pair<string, string>("expQual", expQual));
						}


						this->addRuleViolations(rv, singleRule);
						pCrew->isLegal = false;
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}

						if (strCheckOn == "D")
							break;
						else if (strCheckOn == "P")
						{
							isPairingError = true;
							break;
						}
					}
				}
			}
			if (isPairingError)
			{
				break;
			}
		}
	}

	return isValid;
}
