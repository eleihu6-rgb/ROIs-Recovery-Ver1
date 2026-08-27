#include "CustomRules.h"
//#include "..\db\CrewDB.h"
#include <string>
#include "Utility.h"
#include <boost/format.hpp>
#include <boost/lexical_cast.hpp>
#include <boost/algorithm/string.hpp>
#include "..\db\UtilFunc.h"
#include "..\RuleEngine\RuleEngineDef.h"

#include <iostream>
#include <fstream>

using namespace std;

#include "Util.h"
using namespace boost;
#pragma 

void CustomLegality::setData(int app, SharedPtr<CrewDataContext> data)
{
	this->application = app;
	this->dbData = data;
	populateExipiringFleetRecency();
}

CustomLegality::CustomLegality()
{
}

void CustomLegality::populateExipiringFleetRecency()
{
	RecencyMapWithHashAndEqual recencyOfCrew;

	string strBases, strRanks, strFleets, strActingRanks, strIncludeRoles;
	string strQuals, strRecencyFleets, strOperate, strUnit;
	int iQualDays, iMaxGapPeriod;
	int iQualValidDate = (this->application == ROSTER_OPTIMIZER) ? this->dbData->endUtc : this->dbData->startUtc + TIME_DAY;
	int iRecencyStartDate; // 所關注recency區間的開始日期
	vector<string> vActingRank, vIncludeRole, vQual, vRecencyFleet;
	bool isValidQual, isFleetExpiring;

	printf("Start populating crew recency data...\n");
	vector<SharedPtr<CREW>> crews = this->dbData->crewList;
	for (size_t iRule = 0; iRule < this->dbData->ruleList.size(); iRule++)
	{
		DBRule singleRule = this->dbData->ruleList[iRule];
		if (singleRule.function == 9018) {
			for (auto& itParams : singleRule.params)
			{
				if (itParams.first == "BASES") {
					strBases = itParams.second;
				}
				else if (itParams.first == "RANKS") {
					strRanks = itParams.second;
				}
				else if (itParams.first == "FLEETS") {
					strFleets = itParams.second;
				}
				else if (itParams.first == "ACTING RANKS") {
					strActingRanks = itParams.second;
					boost::split(vActingRank, strActingRanks, boost::is_any_of("|"), boost::token_compress_on);
				}
				else if (itParams.first == "INCLUDE ROLES(OVER)")
				{
					strIncludeRoles = itParams.second;
					boost::split(vIncludeRole, strIncludeRoles, boost::is_any_of("|"), boost::token_compress_on);
				}
				else if (itParams.first == "QUALS") {
					strQuals = itParams.second;
					boost::split(vQual, strQuals, boost::is_any_of("|"), boost::token_compress_on);
				}
				else if (itParams.first == "QUAL DAYS") {
					iQualDays = boost::lexical_cast<int>(itParams.second);
				}
				else if (itParams.first == "RECENCY FLEETS") {
					strRecencyFleets = itParams.second;
					boost::split(vRecencyFleet, strRecencyFleets, boost::is_any_of("|"), boost::token_compress_on);
				}
				else if (itParams.first == "OPERATE") {
					strOperate = itParams.second;
				}
				else if (itParams.first == "MAX GAP PERIOD") {
					iMaxGapPeriod = boost::lexical_cast<int>(itParams.second);
				}
				else if (itParams.first == "PERIOD UNIT") {
					strUnit = itParams.second;
				}
			}

			if (strUnit == "CD")
			{
				iRecencyStartDate = this->dbData->startUtc - iMaxGapPeriod*TIME_DAY;
			}
			else if (strUnit == "CM")
			{
				// 先取得載入區間開始時間, 再往前推算數個月前的月中某一天, 最後再取得一次當月的開始時間
				long iMonthStartDate = Utility::GetInstancePtr()->getLocalMonthStartInUTC(static_cast<long>(this->dbData->startUtc) + TIME_DAY, TPE_OFFSET);
				iRecencyStartDate = Utility::GetInstancePtr()->getLocalMonthStartInUTC(iMonthStartDate - iMaxGapPeriod*TIME_DAY*28, TPE_OFFSET);
			}
			else
			{
				printf("Invalid PERIOD UNIT!!!\n");
				return;
			}

			for (auto& it_crew : crews)
			{
				time_t prevExpUtc = 0, latestExpUtc = 0;
				for (auto& it_rank : (*it_crew).rankList)
				{
					if (prevExpUtc != 0 && (*it_rank).effUtc - prevExpUtc > TIME_DAY)
					{
						latestExpUtc = prevExpUtc;
					}
					prevExpUtc = (*it_rank).expUtc;
				}
				if (latestExpUtc > 0 && latestExpUtc < this->dbData->endUtc && this->dbData->endUtc - latestExpUtc < iQualDays * TIME_DAY)
				{
					// QUAL DAYS定義的天數內如果組員有不在職的情形則不檢查
					continue;
				}

				if (!Utility::GetInstancePtr()->isCrewQualified(it_crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
				{
					continue;
				}

				// Get crew's recency histories
				auto& it_recency = this->dbData->recencyMgr.getRecencyMap().find((*it_crew).idCrew);
				if (it_recency != this->dbData->recencyMgr.getRecencyMap().end())
				{
					recencyOfCrew = (*it_recency).second;
				}
				else
				{
					continue;
				}

				// Get crew's fleet qualifications valid
				isValidQual = false;
				for (auto& it_fleet : (*it_crew).fleetList)
				{
					if (find(vQual.begin(), vQual.end(), (*it_fleet).fleet) != vQual.end() &&
						(*it_fleet).effUtc <= this->dbData->scenario.startDtUTC - iQualDays * TIME_DAY &&
						(*it_fleet).expUtc > iQualValidDate)
					{
						isValidQual = true;
						break;
					}
				}

				if (isValidQual)
				{
					// Check fleet recency based on crew's valid qualification
					isFleetExpiring = true;
					for (auto& recencyClass : recencyOfCrew)
					{
						const SharedPtr<CrewRecency>& key = recencyClass.first;
						if (find(vRecencyFleet.begin(), vRecencyFleet.end(), key->fleet) != vRecencyFleet.end() &&
							key->operate == strOperate)
						{
							for (auto& recency : recencyClass.second)
							{
								if (recency->crewDateUtc >= iRecencyStartDate &&
									recency->crewDateUtc < this->dbData->scenario.startDtUTC)
								{
									if (strActingRanks == "*" || find(vActingRank.begin(), vActingRank.end(), recency->actingRank) != vActingRank.end() ||
										(recency->actingRank == "OVER" && (strIncludeRoles == "*" ||
										find(vIncludeRole.begin(), vIncludeRole.end(), recency->role) != vIncludeRole.end())))
									{
										isFleetExpiring = false;
										break;
									}
								}
							}
						}
						if (!isFleetExpiring)
						{
							break; // 已飛過該機型, 不須再繼續檢查
						}
					}

					if (isFleetExpiring)
					{
						mapCrewExpiringFleet.insert(make_pair((*it_crew).idCrew, strRecencyFleets));
					}
				}
			}
		}
	}
	printf("Complete populating crew recency data.\n");
}

long CustomLegality::ConvertHHMMtoSeconds(string strHHMM)
{
	int iSeparatorIndex;

	iSeparatorIndex = strHHMM.find(':');

	if (iSeparatorIndex < 0) {
		return -1;
	}

	return boost::lexical_cast<int>(strHHMM.substr(0, iSeparatorIndex)) * 3600 +
		boost::lexical_cast<int>(strHHMM.substr(iSeparatorIndex + 1, 2)) * 60;

}

// 只考慮Holiday一筆資料限定一天的情況
long CustomLegality::GetTargetWorkingDate(string country, time_t startDate, int gapWorkingDays)
{
	vector<SharedPtr<Holiday>> vHoliday = this->dbData->holidays;
	vector<SharedPtr<Holiday>>::iterator iter_holiday;

	for (iter_holiday = vHoliday.begin(); iter_holiday != vHoliday.end(); iter_holiday++)
	{
		if ((*iter_holiday)->country != country)
		{
			continue;
		}

		if ((*iter_holiday)->strDt < startDate)
		{
			continue;
		}
		else if ((*iter_holiday)->strDt < startDate + gapWorkingDays * TIME_DAY)
		{
			gapWorkingDays++;
		}
		else
		{
			break;
		}
	}
	return static_cast<long>(startDate + gapWorkingDays * TIME_DAY);
}

int CustomLegality::CalculateGapWorkingDays(string country, time_t startDate, time_t endDate)
{
	int iHolidays = 0;
	vector<SharedPtr<Holiday>> vHoliday = this->dbData->holidays;
	vector<SharedPtr<Holiday>>::iterator iter_holiday;

	for (iter_holiday = vHoliday.begin(); iter_holiday != vHoliday.end(); iter_holiday++)
	{
		if ((*iter_holiday)->country != country)
		{
			continue;
		}

		if ((*iter_holiday)->strDt >= startDate && (*iter_holiday)->endDt < endDate)
		{
			iHolidays++;
		}
	}
	return static_cast<int>((endDate - startDate) / TIME_DAY - iHolidays);
}

// holiday table紀錄的str_dt是utc時間, 故須轉換成所在時區的00:00
bool CustomLegality::getHolidayStartByCountryAndPeriod(vector<time_t>& timeHolidays, string strCountry, time_t timePeriodStart, time_t timePeriodEnd)
{
	int iOffset = 0;
	time_t timeStart;
	vector<SharedPtr<Holiday>> vHoliday = this->dbData->holidays;
	vector<SharedPtr<Holiday>>::iterator iter_holiday;

	timeHolidays.clear();
	if (strCountry == "VN" || strCountry == "TH")
	{
		iOffset = 7;
	}
	else if (strCountry == "JP")
	{
		iOffset = 9;
	}
	else
	{
		iOffset = 8;
	}

	for (iter_holiday = vHoliday.begin(); iter_holiday != vHoliday.end(); iter_holiday++)
	{
		if ((*iter_holiday)->country != strCountry)
		{
			continue;
		}

		if ((*iter_holiday)->strDt >= timePeriodStart && (*iter_holiday)->strDt < timePeriodEnd)
		{
			timeStart = (*iter_holiday)->strDt - (iOffset * TIME_HOUR);
			timeHolidays.push_back(timeStart);
		}
	}

	return !timeHolidays.empty();
}

// 得出pairing是國內線, 國際線SH或長班
int CustomLegality::getFlightType(Pairing* flightPairing)
{
	string strQualifier = flightPairing->getQualifier();
	if (strQualifier == "LH" || strQualifier == "MH" || strQualifier == "UH")
	{
		return FlightType_LongHaul;
	}
	else
	{
		bool isDomestic = true;
		for (int i = 0; i < flightPairing->getNumDuties(); i++)
		{
			Duty* duty = flightPairing->getDuty(i);
			for (int j = 0; j < duty->getNumSegments(); j++)
			{
				Segment* segment = duty->getSegment(j);
				if (this->dbData->findAirportCountry(segment->getDepStation()) != "TW" ||
					this->dbData->findAirportCountry(segment->getArrStation()) != "TW")
				{
					isDomestic = false;
					break;
				}
			}
			if (!isDomestic)
			{
				break;
			}
		}

		if (isDomestic)
		{
			return FlightType_Domestic;
		}
		else
		{
			return FlightType_ShortHaul;
		}
	}
}

CUSTOM_VIOLATION* sample_check_1(const SharedPtr<CREW> crew, const DBRule* singleRule, CustomLegality* legality)
{
	CUSTOM_VIOLATION* violation = new CUSTOM_VIOLATION();
	violation->isLegal = false;
	violation->legalMessage = "--TESTING TESTING--";
	return violation;
}

CustomLegality::~CustomLegality()
{

}

std::vector<CUSTOM_VIOLATION*> CustomLegality::Custom_Rules_Check(SharedPtr<CREW> crew, DBRule* singleRule)
{
	vector<CUSTOM_VIOLATION*> violations;
	CUSTOM_VIOLATION* violation = NULL;

	//violation = sample_check_1(crew, singleRule, this);
	//if (!(violation->isLegal))
	//	violations.push_back(violation);
	switch (singleRule->function)
	{
	case 9001:
		violation = sample_check_1(crew, singleRule, this);
		if (!(violation->isLegal))
			violations.push_back(violation);
		//20180124 ain, mantis#2765, mem leak
		else {
			delete violation;
			violation = NULL;
		}
		break;
	case 9002:
		violations = checkAfterLongDP(crew, singleRule);
		break;
	case 9003:
		violations = checkAfterReinstate(crew, singleRule);
		break;
	case 9004:
		violations = checkPassportAndVisa(crew, singleRule);
		break;
	case 9005:
		violations = checkStandbyAfterConsecutiveDuties(crew, singleRule);
		break;
	case 9006:
		violations = checkDayOffGap(crew, singleRule);
		break;
	case 9007:
		violations = checkLHSBBeforeConsecutiveDOs(crew, singleRule);
		break;
	case 9008:
		violations = checkMaxBHOfTotalLH(crew, singleRule);
		break;
	case 9009:
		violations = checkJPPNC(crew, singleRule);
		break;
	case 9010:
		violations = checkJP5DayDuty(crew, singleRule);
		break;
	case 9011:
		violations = checkExpatOprMoving(crew, singleRule);
		break;
	case 9012:
		violations = checkExpatLayover(crew, singleRule);
		break;
	case 9013:
		violations = checkDOHoliday(crew, singleRule);
		break;
	case 9014:
		violations = checkConsecutiveFlight(crew, singleRule);
		break;
	case 9015:
		violations = checkNightFltRst(crew, singleRule);
		break;
	case 9016:
		violations = checkFirstFLTaftPromotion(crew, singleRule);
		break;
	case 9017:
		violations = checkCon24FtFdp(crew, singleRule);
		break;
	case 9018:
		violations = checkCrewFleetRecency(crew, singleRule);
		break;
	case 9019:
		violations = checkNumberOfCAEQCA(crew, singleRule);
		break;
	case 9020:
		violations = checkMinJPN(crew, singleRule);
		break;
	case 9021:
		violations = checkAcclimatize(crew, singleRule);
		break;
	default:
		break;
	}

	return violations;
}

// ALDP: After long duty period pattern (> 11:00), the next duty start time should be after 14:00
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkAfterLongDP(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;

	return rvs;
}

// 9003, AFTRIN: If a crew is re-instated, limit destination countries in specific days
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkAfterReinstate(SharedPtr<CREW> crew, DBRule* singleRule) {

	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<CREW_STATUS>> vCrewStatus = crew->statusList;
	map<string, string> ruleParams = singleRule->params;
	vector<string> vStatus, vStandbyQual, vCountry, vExcludeDutyType;
	string strCrewStatus, strCountry, strUnit;
	int iGapDays;
	long iStatusChangeTime = 0;

	for (auto& itParams : ruleParams)
	{
		string strParamKey = itParams.first;
		string strParamValue = itParams.second;
		if (strParamKey == "CREW STATUS") {
			boost::split(vStatus, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (strParamKey == "STANDBY DUTY QUALIFIERS") {
			boost::split(vStandbyQual, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (strParamKey == "COUNTRIES") {
			boost::split(vCountry, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (strParamKey == "GAP") {
			iGapDays = boost::lexical_cast<int>(strParamValue);
		}
		else if (strParamKey == "UNIT") {
			strUnit = strParamValue;
		}
		else if (strParamKey == "EXCLUDE CONSECUTIVE DUTIES") {
			boost::split(vExcludeDutyType, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
		}
	}

	for (auto& itCrewStatus : vCrewStatus)
	{
		for (auto& itStatus : vStatus)
		{
			if (itCrewStatus->status == itStatus)
			{
				strCrewStatus = itCrewStatus->status;
				iStatusChangeTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>(itCrewStatus->effDt), TPE_OFFSET);
			}
		}
	}

	if (iStatusChangeTime == 0 || iStatusChangeTime < this->dbData->scenario.startDtUTC - (90 * TIME_DAY))
	{
		// 沒有復職紀錄或是復職紀錄在3個月之前
		return rvs;
	}
	else
	{
		vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
		string strPattern;
		long timeRoster;
		long timeAvailable = 0;
		bool isLimitedDuty;
		bool isMaternityLeave = false; // 連續產假則復職日往後順延

		for (auto itRoster : vRoster)
		{
			if ((*itRoster).qualifier == "ML")
			{
				isMaternityLeave = true; 
				break;
			}
		}

		// 檢查復職後有沒有連續假日
		for (auto itRoster = vRoster.begin(); itRoster != vRoster.end(); itRoster++)
		{
			timeRoster = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*itRoster)->actStrUtc), TPE_OFFSET);

			if (timeRoster < iStatusChangeTime)
			{
				continue;
			}

			if (isMaternityLeave)
			{
				if ((*itRoster)->qualifier == "ML" || (*itRoster)->qualifier == "DO") // 產假遇到假日會安排DO
				{
					iStatusChangeTime = timeRoster + TIME_DAY;
					continue;
				}
				else
				{
					isMaternityLeave = false;
				}
			}

			if (find(vExcludeDutyType.begin(), vExcludeDutyType.end(), (*itRoster)->duty) != vExcludeDutyType.end())
			{
				// 如果復職日當天是LEA, 則復職起始日順延一天
				iStatusChangeTime = timeRoster + TIME_DAY;
			}
			else
			{
				break;
			}
		}

		// 算出復職日起N個工作天
		if (strUnit == "WD")
		{
			timeAvailable = GetTargetWorkingDate(crew->nationality, iStatusChangeTime, iGapDays);
		}
		else
		{
			timeAvailable = iStatusChangeTime + iGapDays * TIME_DAY;
		}

		// Check if the roster is flight to US or Australia/New Zealand
		for (auto itRoster = vRoster.begin(); itRoster != vRoster.end(); itRoster++)
		{
			timeRoster = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*itRoster)->actStrUtc), TPE_OFFSET);

			// 如果班表在復職日前, 則不檢查, 因為組員可能只留停幾星期就復職了, 復職前一個月還是可能有排班
			if (timeRoster < iStatusChangeTime)
			{
				continue;
			}

			if (!(*itRoster)->pairing)
			{
				continue;
			}

			isLimitedDuty = false;
			if ((*itRoster)->duty == "RB")
			{
				if (find(vStandbyQual.begin(), vStandbyQual.end(), (*itRoster)->qualifier) != vStandbyQual.end())
				{
					isLimitedDuty = true;
				}
			}
			else if ((*itRoster)->duty == "FLY")
			{
				vector<Duty *> duties = (*itRoster)->pairing->getDutyVec();
				for (auto& itDuty : duties)
				{
					vector<Segment *> segments = itDuty->getSegments();
					for (auto& itSegment : segments)
					{
						//segment
						strCountry = this->dbData->findAirportCountry(itSegment->getArrStation());
						if (find(vCountry.begin(), vCountry.end(), strCountry) != vCountry.end())
						{
							isLimitedDuty = true;
						}
					}
				}
			}

			// 預佔違反時, 優化引擎仍可繼續排班
			if (isLimitedDuty && timeRoster < timeAvailable && !(this->application == ROSTER_OPTIMIZER && (*itRoster)->source == "PA"))
			{
				const char* FMT_VIOLATION_DAY = "The days between %s day and pattern [%s] are %d%s %s - under the limitation of %d%s days";
				char msg[128];
				int iStatusChangeDays;

				if (strUnit == "WD")
				{
					iStatusChangeDays = CalculateGapWorkingDays(crew->nationality, iStatusChangeTime, timeRoster);
				}
				else
				{
					iStatusChangeDays = static_cast<int>((timeRoster - iStatusChangeTime) / TIME_DAY);
				}
				sprintf_s(msg, sizeof(msg), FMT_VIOLATION_DAY,
					strCrewStatus.c_str(),
					(*itRoster)->label.c_str(),
					iStatusChangeDays,
					(strUnit == "WD" ? " working" : ""),
					(iStatusChangeDays > 1 ? "days" : "day"),
					iGapDays,
					(strUnit == "WD" ? " working" : ""));

				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
				rv->isLegal = false;
				rv->startUtc = static_cast<long>((*itRoster)->actStrUtc);
				rv->endUtc = static_cast<long>((*itRoster)->actRestStrUtc);
				rv->rosterId = (*itRoster)->rosterId;
				rv->pairingId = (*itRoster)->pairId;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				rv->legalMessage = msg;
				rv->operation_result.insert(make_pair("crewStatus", strCrewStatus));
				rv->operation_result.insert(make_pair("rosterLabel", (*itRoster)->label));
				rv->operation_result.insert(make_pair("actualGap", boost::lexical_cast<string>(iStatusChangeDays)));
				rv->operation_result.insert(make_pair("minGap", boost::lexical_cast<string>(iGapDays)));
				rv->operation_result.insert(make_pair("gapUnit", iGapDays > 1 ? "days" : "day"));

				rvs.push_back(rv);
				if (this->application == ROSTER_OPTIMIZER) {
					return rvs;
				}
			}
		}

	}
	return rvs;
}

// 9004, PASVSA: Check duty limitation before, during and after PAS,P/R,VSA,VSR
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkPassportAndVisa(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	map<string, string> ruleParams = singleRule->params;
	vector<SharedPtr<DBRule_8014>> assignments = this->dbData->rule_8014;
	vector<string> restAssignments;
	string strDayAssignmentCode, strPatternCode, strSecondCode;
	vector<string> nationalities;
	vector<string> startAirports;
	vector<string> allowableCountries;
	vector<string> prohibitedCountries;
	vector<string>::iterator iter_country;
	vector<string> allowalbeSBQuals;
	vector<string> prohibitedSBQuals;
	string strParamValue, strCountry;
	string strCrewBase = "";
	string strRenewType;
	string strFirstGapUnit, strSecondGapUnit;
	int iFirstGapDays = 0, iSecondGapDays = 0;
	bool isLegal, isNativeCrew;
	bool isDuplicateRenewal = false;
	bool needCheckBefore = false, needCheckAfter = false;
	bool isAllPA;
	long iRenewDateTime = 0, iCompleteDateTime = 0, iLimitationDateTime = 0;
	char date_buf[30];

	// read rule parameters
	for (auto& iter_params : ruleParams)
	{
		if (iter_params.first == "NATIONALITIES")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				boost::split(nationalities, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter_params.first == "DAY ASSIGNMENT CODE")
		{
			// PAS or VSA
			strDayAssignmentCode = iter_params.second;
		}
		else if (iter_params.first == "PATTERN CODE")
		{
			// P/R or VSR
			strPatternCode = iter_params.second;
		}
		else if (iter_params.first == "FIRST GAP DAYS")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				iFirstGapDays = boost::lexical_cast<int>(strParamValue);
			}
		}
		else if (iter_params.first == "FIRST GAP DAYS UNIT")
		{
			strFirstGapUnit = iter_params.second;
		}
		else if (iter_params.first == "FIRST GAP START AIRPORTS")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				boost::split(startAirports, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter_params.first == "FIRST GAP ALLOWABLE COUNTRIES")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				boost::split(allowableCountries, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter_params.first == "FIRST GAP ALLOWABLE SB QUALS")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				boost::split(allowalbeSBQuals, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter_params.first == "SECOND CODE")
		{
			strSecondCode = iter_params.second;
		}
		else if (iter_params.first == "SECOND GAP DAYS")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				iSecondGapDays = boost::lexical_cast<int>(strParamValue);
			}
		}
		else if (iter_params.first == "SECOND GAP DAYS UNIT")
		{
			strSecondGapUnit = iter_params.second;
		}
		else if (iter_params.first == "SECOND GAP PROHIBITED COUNTRIES")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				boost::split(prohibitedCountries, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter_params.first == "SECOND GAP PROHIBITED SB QUALS")
		{
			strParamValue = iter_params.second;
			if (strParamValue != "*")
			{
				boost::split(prohibitedSBQuals, strParamValue, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
	}

	isLegal = false;
	for (iter_country = nationalities.begin(); iter_country != nationalities.end(); iter_country++)
	{
		if (*iter_country == crew->nationality)
		{
			isLegal = true;
			break;
		}
	}

	// if crew's nationality does not match, do nothing
	if (!isLegal)
	{
		return rvs;
	}
	else if (crew->nationality == "TW")
	{
		isNativeCrew = true;
	}
	else
	{
		isNativeCrew = false;
	}

	// Collect rest assignment definition
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == "REST" && (*assignment)->airline == this->dbData->scenario.airline)
		{
			restAssignments.push_back((*assignment)->assignemnt);
		}
	}

	// Step 1: Get PAS/VSA start date and complete date
	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		// Step 1: Get PAS/VSA start date and complete date
		if ((*iter_roster)->pairing && (*iter_roster)->pairing->getLabel().length() >= 7 &&
			(*iter_roster)->pairing->getLabel().substr(4, 3) == strPatternCode)
		{
			// 取得辦理護照簽證當天TPE時間的00:00
			if (iRenewDateTime == 0)
			{
				strRenewType = strPatternCode;
				iRenewDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), TPE_OFFSET);

				// 組員辦理護照簽證更換時的home base
				strCrewBase = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, iRenewDateTime);

			}
			else
			{
				// 如果成對出現, 第二個PAS/VSA當天的結束時間當成護照簽證辦理完成的TPE時間
				iCompleteDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), TPE_OFFSET) + TIME_DAY;
			}
		}
		else if ((*iter_roster)->qualifier == strDayAssignmentCode)
		{
			// 取得辦理護照簽證當天的TPE時間00:00
			if (iRenewDateTime == 0)
			{
				strRenewType = strDayAssignmentCode;
				iRenewDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), TPE_OFFSET);

				// 組員辦理護照簽證更換時的home base
				strCrewBase = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, iRenewDateTime);

				// 本籍組員辦理PAS/VSA的前一個勤務要從TPE出發
				needCheckBefore = isNativeCrew;
			}
			else
			{
				// 如果成對出現, 第二個PAS/VSA當天的結束時間當成護照簽證辦理完成的時間
				iCompleteDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), TPE_OFFSET) + TIME_DAY;
			}
		}
		else if (strSecondCode != "*" &&
			((*iter_roster)->qualifier == strSecondCode ||
			((*iter_roster)->pairing && (*iter_roster)->pairing->getLabel().length() >= 7 &&
			(*iter_roster)->pairing->getLabel().substr(4, 3) == strSecondCode)))
		{
			if (iRenewDateTime > 0 && iCompleteDateTime == 0)
			{
				iCompleteDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), TPE_OFFSET) + TIME_DAY;
			}
		}
	}

	if (iCompleteDateTime == 0 && iFirstGapDays > 0)
	{
		if (strFirstGapUnit == "WD")
		{
			iCompleteDateTime = GetTargetWorkingDate(crew->nationality, iRenewDateTime, iFirstGapDays);
		}
		else
		{
			iCompleteDateTime = iRenewDateTime + iFirstGapDays * TIME_DAY;
		}

		// 若本籍組員PAS, P/R, VSA, VSR只安排一個沒有成對, 則需要檢查完成後的第一個勤務從TPE出發
		needCheckAfter = isNativeCrew;
	}

	if (iCompleteDateTime > 0)
	{
		if (strSecondGapUnit == "WD")
		{
			iLimitationDateTime = GetTargetWorkingDate(crew->nationality, iCompleteDateTime, iSecondGapDays);
		}
		else
		{
			iLimitationDateTime = iCompleteDateTime + iSecondGapDays * TIME_DAY;
		}
	}

	if (iRenewDateTime <= 0 || iCompleteDateTime <= 0 || iLimitationDateTime <= 0)
	{
		// 資料不齊, 無法得出護照申辦的開始結束時間和限制飛航特定國家的期間, 可得知組員在此期間沒有安排更換護照簽證
		return rvs;
	}

	isAllPA = true;
	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		// Found Passport/Visa renewal
		if ((*iter_roster)->actStrUtc < iRenewDateTime)
		{
			continue;
		}

		// 檢查護照簽證申請日之後的勤務是否都是預佔
		if ((*iter_roster)->source != "PA")
		{
			isAllPA = false;
		}

		//Step 2: The previous duty of renew date must start from TPE (Home port)
		if (isNativeCrew && needCheckBefore)
		{
			// Go backward to find the previous duty except rest or ground duty
			if (iter_roster != vRoster.begin())
			{
				bool isPriorAllPA = isAllPA;  // 護照簽證申請日之前的勤務是否都是PA
				int i = 0;
				do {
					i++;

					if ((*(iter_roster - i))->source != "PA")
					{
						isPriorAllPA = false;
					}

					if (!(*(iter_roster - i))->pairing)
					{
						if (find(restAssignments.begin(), restAssignments.end(), (*(iter_roster - i))->duty) != restAssignments.end())
						{
							// If rest, skip and look for previous duty
							continue;
						}
						else
						{
							// In a home base ground duty, crew can hand in passport
							break;
						}
					}
					else if ((*(iter_roster - i))->pairing->getBase() == strCrewBase)
					{
						// If the duty is on home base, crew can hand in passport
						break;
					}
					else if (((*(iter_roster - i))->duty == "FLY" || (*(iter_roster - i))->duty == "RB") &&
						!(this->application == ROSTER_OPTIMIZER && isPriorAllPA)) // 如果護照簽證申請日之前的勤務都是PA, 優化引擎視為合法
					{
						util_timeT_to_dateStr((*(iter_roster - i))->actStrUtc, date_buf, sizeof(date_buf));

						CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
						rv->isLegal = false;
						rv->startUtc = static_cast<long>((*(iter_roster - i))->actStrUtc);
						rv->endUtc = iRenewDateTime;
						rv->rosterId = (*(iter_roster - i))->rosterId;
						rv->pairingId = (*(iter_roster - i))->pairId;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						rv->legalMessage = (*(iter_roster - i))->label +
							" on " +
							string(date_buf) +
							" before passport renew violates " +
							strRenewType +
							" regulation";
						rv->operation_result.insert(make_pair("rosterLabel", (*(iter_roster - i))->label));
						rv->operation_result.insert(make_pair("renewType", strRenewType));

						rvs.push_back(rv);
						if (this->application == ROSTER_OPTIMIZER)
						{
							return rvs;
						}
					}
					else
					{
						// If a ground duty is on other airport (i.e. TSA), skip this one
						continue;
					}
				} while ((iter_roster - i) != vRoster.begin());
			}

			// Check duty before renew date completely, no need to check again.
			needCheckBefore = false;
			continue;
		}

		// Step 3: Check flights feasible for general description during passport/visa renewal. Long-haul standby is not valid.
		if (isNativeCrew && (*iter_roster)->actStrUtc < iCompleteDateTime)
		{
			isLegal = true;
			if ((*iter_roster)->duty == "FLY" && (*iter_roster)->pairing)
			{
				isLegal = false;
				// Only TPE/KHH allows flight duties using general description
				string strBaseAirport = (*iter_roster)->getBase();
				// Only T/R flight duty is possibly legal
				string strAttribute = (*iter_roster)->pairing->getAttribute();
				if (find(startAirports.begin(), startAirports.end(), strBaseAirport) != startAirports.end() &&
					strAttribute.length() > 0 && strAttribute.at(0) == 'T')
				{
					vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
					long depDate = 0;

					isLegal = true;
					for (vector<Duty *>::iterator iter_duty = duties.begin(); iter_duty != duties.end(); iter_duty++)
					{
						vector<Segment *> segments = (*iter_duty)->getSegments();

						for (vector<Segment *>::iterator iter_segment = segments.begin(); iter_segment != segments.end(); iter_segment++)
						{
							strCountry = this->dbData->findAirportCountry((*iter_segment)->getArrStation());
							if (find(allowableCountries.begin(), allowableCountries.end(), strCountry) == allowableCountries.end())
							{
								// find a country which cannot use general description
								isLegal = false;
								break;
							}
							if (depDate == 0)
							{
								depDate = Utility::GetInstancePtr()->getLocalDayStartInUTC((*iter_segment)->getStartTimeUtcSch(), TPE_OFFSET);
							}
							else if (depDate != Utility::GetInstancePtr()->getLocalDayStartInUTC((*iter_segment)->getStartTimeUtcSch(), TPE_OFFSET))
							{
								// outbound and inbound departure time are not in the same day.
								// That means T/R pattern with rest, i.e. CTPEHKG08
								isLegal = false;
								break;
							}
						}
						if (!isLegal)
						{
							break;
						}
					}
				}
			}
			else if ((*iter_roster)->duty == "RB")
			{
				// 不可排松山待命, 只能排短程待命
				if (find(startAirports.begin(), startAirports.end(), (*iter_roster)->getBase()) == startAirports.end() ||
					find(allowalbeSBQuals.begin(), allowalbeSBQuals.end(), (*iter_roster)->qualifier) == allowalbeSBQuals.end())
				{
					isLegal = false;
				}
			}

			if (!isLegal && !(this->application == ROSTER_OPTIMIZER && isAllPA))
			{
				util_timeT_to_dateStr((*iter_roster)->actStrUtc, date_buf, sizeof(date_buf));

				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
				rv->isLegal = false;
				rv->startUtc = iRenewDateTime;
				rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
				rv->rosterId = (*iter_roster)->rosterId;
				rv->pairingId = (*iter_roster)->pairId;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				rv->legalMessage = (*iter_roster)->label +
					" on " +
					string(date_buf) +
					" during passport renew violates " +
					strRenewType +
					" regulation";
				rv->operation_result.insert(make_pair("rosterLabel", (*iter_roster)->label));
				rv->operation_result.insert(make_pair("renewType", strRenewType));

				rvs.push_back(rv);
				if (this->application == ROSTER_OPTIMIZER)
				{
					return rvs;
				}
			}
		}
		else
		{
			// Step 4: Check the next duty after complete date must start from TPE (Home port)
			if (isNativeCrew && needCheckAfter)
			{
				if (!(*iter_roster)->pairing)
				{
					if (find(restAssignments.begin(), restAssignments.end(), (*iter_roster)->duty) == restAssignments.end())
					{
						// A home base ground duty is legal to get passport back
						needCheckAfter = false;
					}
				}
				else if ((*iter_roster)->pairing->getBase() == strCrewBase)
				{
					// If the duty is on home base, it is legal to get passport back
					needCheckAfter = false;
				}
				else if ((*iter_roster)->duty == "FLY")
				{
					needCheckAfter = false;

					if (!(this->application == ROSTER_OPTIMIZER && isAllPA))
					{
						util_timeT_to_dateStr((*iter_roster)->actStrUtc, date_buf, sizeof(date_buf));

						CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
						rv->isLegal = false;
						rv->startUtc = iRenewDateTime;
						rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
						rv->rosterId = (*iter_roster)->rosterId;
						rv->pairingId = (*iter_roster)->pairId;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						rv->legalMessage = (*iter_roster)->label +
							" on " +
							string(date_buf) +
							" after passport renew violates " +
							strRenewType +
							" regulation";
						rv->operation_result.insert(make_pair("rosterLabel", (*iter_roster)->label));
						rv->operation_result.insert(make_pair("renewType", strRenewType));

						rvs.push_back(rv);
						if (this->application == ROSTER_OPTIMIZER)
						{
							return rvs;
						}
					}
				}
			}

			// Step 5: Check flight country limitation during specific days
			if ((*iter_roster)->actStrUtc < iLimitationDateTime)
			{
				isLegal = true;
				if ((*iter_roster)->duty == "FLY" && (*iter_roster)->pairing)
				{
					vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
					for (vector<Duty *>::iterator iter_duty = duties.begin(); iter_duty != duties.end(); iter_duty++)
					{
						vector<Segment *> segments = (*iter_duty)->getSegments();
						for (vector<Segment *>::iterator iter_segment = segments.begin(); iter_segment != segments.end(); iter_segment++)
						{
							strCountry = this->dbData->findAirportCountry((*iter_segment)->getArrStation());
							if (find(prohibitedCountries.begin(), prohibitedCountries.end(), strCountry) != prohibitedCountries.end() &&
								!(this->application == ROSTER_OPTIMIZER && isAllPA))
							{
								isLegal = false;
							}
						}
					}
				}
				else if ((*iter_roster)->duty == "RB")
				{
					if (find(prohibitedSBQuals.begin(), prohibitedSBQuals.end(), (*iter_roster)->qualifier) != prohibitedSBQuals.end())
					{
						isLegal = false;
					}
				}

				if (!isLegal && !(this->application == ROSTER_OPTIMIZER && (*iter_roster)->source == "PA"))
				{
					util_timeT_to_dateStr((*iter_roster)->actStrUtc, date_buf, sizeof(date_buf));

					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = iRenewDateTime;
					rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
					rv->rosterId = (*iter_roster)->rosterId;
					rv->pairingId = (*iter_roster)->pairId;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					rv->legalMessage = (*iter_roster)->label +
						" on " +
						string(date_buf) +
						" after passport renew violates " +
						strRenewType +
						" regulation";
					rv->operation_result.insert(make_pair("rosterLabel", (*iter_roster)->label));
					rv->operation_result.insert(make_pair("renewType", strRenewType));

					rvs.push_back(rv);
					if (this->application == ROSTER_OPTIMIZER)
					{
						return rvs;
					}
				}
			}
			else
			{
				break;
			}
		}
	}

	return rvs;
}

// 9005, SBafConRgn: No Standby report time after HH:MM on the N day followed by N-1 consecutive duties. 
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkStandbyAfterConsecutiveDuties(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	long iConStartDateTime;
	long iPrevDutyEndTime, iDutyStartTime;
	int iOffset;
	vector<SharedPtr<DBRule_8014>> assignments = this->dbData->rule_8014;
	vector<string> restAssignments;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	map<string, string> ruleParams = singleRule->params;
	map<string, string>::iterator iter_params;
	vector<string> consecutiveDuties;
	vector<string> excludeDuties;
	vector<string> excludeQualifiers;
	string strParamConsecutiveDuties;
	string strParamReportTime;
	string strExcludeQualifier;
	int iParamConsecutiveDays, iParamRestGapHours;
	int iParamReportTime;
	bool isConsecutive;
	bool isTargetDuty;
	long iPAStartTime;  // 紀錄連續PA(Pre-Assigned)勤務的開始時間

	for (iter_params = ruleParams.begin(); iter_params != ruleParams.end(); iter_params++)
	{
		if (iter_params->first == "CONSECUTIVE DUTIES")
		{
			strParamConsecutiveDuties = iter_params->second;
			boost::split(consecutiveDuties, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "CONSECUTIVE DAYS WITHOUT REST GAP DAYS")
		{
			iParamConsecutiveDays = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "REST GAP HOURS")
		{
			iParamRestGapHours = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "REPORTING TIME LATER THAN")
		{
			strParamReportTime = iter_params->second;
			iParamReportTime = ConvertHHMMtoSeconds(strParamReportTime);
			if (iParamReportTime < 0) return rvs;
		}
		else if (iter_params->first == "EXCLUDE DUTIES")
		{
			boost::split(excludeDuties, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "EXCLUDE QUALIFIERS")
		{
			strExcludeQualifier = iter_params->second;
			if (strExcludeQualifier != "*")
			{
				boost::split(excludeQualifiers, strExcludeQualifier, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
	}

	iConStartDateTime = 0;
	iPrevDutyEndTime = 0;
	isConsecutive = false;
	iPAStartTime = 0;
	iOffset = this->dbData->getAirportOffset(crew->getPrimeBase());

	// Collect rest assignment definition
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == "REST" && (*assignment)->airline == this->dbData->scenario.airline)
		{
			restAssignments.push_back((*assignment)->assignemnt);
		}
	}

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if (find(restAssignments.begin(), restAssignments.end(), (*iter_roster)->duty) != restAssignments.end())
		{
			continue;
		}

		if ((*iter_roster)->source == "PA")
		{
			if (iPAStartTime == 0)
			{
				// 因為要和iConStartDateTime比較, 所以紀錄預佔勤務當天的00:00
				iPAStartTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), iOffset);
			}
		}
		else
		{
			iPAStartTime = 0;
		}

		// check if the assignment group is existed in rule parameter (FLY/RB/GND)
		if (find(consecutiveDuties.begin(), consecutiveDuties.end(), (*iter_roster)->duty) != consecutiveDuties.end())
		{
			isTargetDuty = true;

			if ((*iter_roster)->pairing && (*iter_roster)->duty == "FLY")
			{
				vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
				for (vector<Duty *>::iterator iter_duty = duties.begin(); iter_duty != duties.end(); iter_duty++)
				{
					// (*iter_duty)->GetDepTime() return 0, so look into segments to get duty start time
					vector<Segment *> segments = (*iter_duty)->getSegments();
					for (vector<Segment*>::iterator iter_segment = segments.begin(); iter_segment != segments.end(); iter_segment++)
					{
						iDutyStartTime = (*iter_segment)->getStartTimeUtcSch();
						if (iDutyStartTime - iPrevDutyEndTime >= iParamRestGapHours * TIME_HOUR)
						{
							// Rest or L/O time is more than 30 hours, so new consecutive duties start from this segment
							isConsecutive = false;
							iConStartDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(iDutyStartTime, iOffset);
						}
						else
						{
							isConsecutive = true;
						}
						iPrevDutyEndTime = (*iter_segment)->getEndTimeUtcSch();
					}
				}
			}
			else
			{
				iDutyStartTime = static_cast<long>((*iter_roster)->actStrUtc);
				if (iDutyStartTime - iPrevDutyEndTime >= iParamRestGapHours * TIME_HOUR)
				{
					isConsecutive = false;
					iConStartDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), iOffset);
				}
				else
				{
					isConsecutive = true;
				}
			}
		}
		else
		{
			isTargetDuty = false;
		}

		// Prior consecutive duties are more than 5 days
		if (find(excludeDuties.begin(), excludeDuties.end(), (*iter_roster)->duty) != excludeDuties.end())
		{
			if (isConsecutive && iConStartDateTime > 0 &&
				iPrevDutyEndTime - iConStartDateTime >= (iParamConsecutiveDays - 1) * TIME_DAY &&
				!(this->application == ROSTER_OPTIMIZER && iPAStartTime > 0 && iPAStartTime <= iConStartDateTime))
			{
				if (strExcludeQualifier == "*" ||
					find(excludeQualifiers.begin(), excludeQualifiers.end(), (*iter_roster)->qualifier) != excludeQualifiers.end())
				{
					iDutyStartTime = static_cast<long>((*iter_roster)->actStrUtc);
					if (iDutyStartTime - iPrevDutyEndTime <= iParamRestGapHours * TIME_HOUR &&
						iDutyStartTime - Utility::GetInstancePtr()->getLocalDayStartInUTC(iDutyStartTime, iOffset) >= iParamReportTime)
					{
						CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
						rv->isLegal = false;
						rv->startUtc = iConStartDateTime;
						rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
						rv->rosterId = (*iter_roster)->rosterId;
						rv->pairingId = (*iter_roster)->pairId;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						rv->legalMessage = (*iter_roster)->label +
							" is assigned after " +
							boost::lexical_cast<string>(iParamConsecutiveDays) +
							" consecutive days";
						rv->operation_result.insert(make_pair("rosterLabel", (*iter_roster)->label));
						rv->operation_result.insert(make_pair("conDuty", boost::lexical_cast<string>(iParamConsecutiveDays)));
						rv->operation_result.insert(make_pair("dutyType", strParamConsecutiveDuties));

						rvs.push_back(rv);
						if (this->application == ROSTER_OPTIMIZER)
						{
							return rvs;
						}
					}
				}
			}
		}

		if (!isTargetDuty)
		{
			isConsecutive = false;
			iConStartDateTime = 0;
		}

		iPrevDutyEndTime = static_cast<long>((*iter_roster)->actRestStrUtc);
	}

	return rvs;
}

// 9006, LimDODuty: Consecutive X days of OFF or LEA before or after the single day duty (Reporting time and End time on the same day). 
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkDayOffGap(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	map<string, string> ruleParams = singleRule->params;
	map<string, string>::iterator iter_params;
	vector<SharedPtr<DBRule_8014>> assignments = this->dbData->rule_8014;
	vector<string> consecutiveAssignmentGroups;
	vector<string> gapAssignmentGroups;
	vector<string> consecutiveAssignments;
	string strBases, strRanks, strFleets;
	int iParamFirstDays, iParamSecondDays;
	int iParamGapDays;
	string strConsecutiveAssignments;
	string strGapUnit;
	string strRosterLabel;
	string strCrewNationality;
	int iOffset;                // 組員基地的時區
	int iConBlankDaysAsDO = 0;	// 最大的連續空白日當成DO, 例如設為2表示2天以內的空白天視為DO, 3天就不算
	long iPrevConStartTime = 0;	// 紀錄目標勤務之前連續DO的起始日期
	long iCurrentConStartTime;	// 紀錄目標勤務之後連續DO的起始日期
	int iPrevConDays;			// 紀錄目標勤務之前連續DO的日數
	int iCurrentConDays;		// 紀錄目標勤務之後連續DO的日數
	int iErrorStartTime;        // 在法規錯誤訊息顯示連續日期的開始時間
	int iErrorConDays;			// 在法規錯誤訊息顯示之前連續DO的日數
	long iDutyStartTime, iDutyEndTime;
	long iDutyEndNextDate = 0, iPrevDutyEndNextDate = 0;
	bool isError = false;
	bool isPrevDutyPA = false;
	bool isExpatCrew = false;
	bool isAtHomebase = true;

	for (iter_params = ruleParams.begin(); iter_params != ruleParams.end(); iter_params++)
	{
		if (iter_params->first == "BASES")
		{
			strBases = iter_params->second;
		}
		else if (iter_params->first == "RANKS")
		{
			strRanks = iter_params->second;
		}
		else if (iter_params->first == "FLEETS")
		{
			strFleets = iter_params->second;
		}
		else if (iter_params->first == "CONSECUTIVE ASSIGNMENT GROUPS")
		{
			strConsecutiveAssignments = iter_params->second;
			boost::split(consecutiveAssignmentGroups, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "CONSECUTIVE DAYS 1")
		{
			iParamFirstDays = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "GAP ASSIGNMENT GROUPS")
		{
			boost::split(gapAssignmentGroups, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "MIN GAP")
		{
			iParamGapDays = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "MIN GAP UNIT")
		{
			strGapUnit = iter_params->second;
		}
		else if (iter_params->first == "CONSECUTIVE DAYS 2")
		{
			iParamSecondDays = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "CONSECUTIVE BLANK DAYS AS DO")
		{
			// 設定連續空白天當成DO的限制, 避免一開始都是空白日無法排上勤務
			iConBlankDaysAsDO = boost::lexical_cast<int>(iter_params->second);
		}
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->airline == this->dbData->scenario.airline &&
			find(consecutiveAssignmentGroups.begin(), consecutiveAssignmentGroups.end(), (*assignment)->assignmentGroup) != consecutiveAssignmentGroups.end())
		{
			consecutiveAssignments.push_back((*assignment)->assignemnt);
		}
	}

	iCurrentConStartTime = 0;
	iPrevDutyEndNextDate = iCurrentConStartTime;
	isExpatCrew = (crew->nationality != "TW");
	iOffset = this->dbData->getAirportOffset(crew->getPrimeBase());

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		iDutyStartTime = static_cast<long>((*iter_roster)->actStrUtc);
		iDutyEndTime = static_cast<long>((*iter_roster)->actRestStrUtc);
		iDutyEndNextDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(iDutyEndTime - 1, iOffset) + TIME_DAY;

		// Find DO/LEA
		if (find(consecutiveAssignments.begin(), consecutiveAssignments.end(), (*iter_roster)->duty) != consecutiveAssignments.end())
		{
			if (iDutyStartTime - iPrevDutyEndNextDate >= (iConBlankDaysAsDO + 1) * TIME_DAY)
			{
				iCurrentConStartTime = iDutyStartTime;
				iCurrentConDays = 1;
				iPrevConDays = 0; // 已經不連續
			}
			else
			{
				iCurrentConDays = (iDutyEndNextDate - iCurrentConStartTime) / TIME_DAY;

				// 上個非預佔的單日勤務後面又接了DO或AL造成違規
				if (iPrevConStartTime > 0 &&
					iCurrentConStartTime - iPrevConStartTime < TIME_DAY * (iParamGapDays + iPrevConDays) &&
					!(this->application == ROSTER_OPTIMIZER && isPrevDutyPA) &&
					((iPrevConDays >= iParamFirstDays && iCurrentConDays >= iParamSecondDays) ||
					(iPrevConDays >= iParamSecondDays && iCurrentConDays >= iParamFirstDays)))
				{
					isError = true;
					iErrorStartTime = iPrevConStartTime;
					iErrorConDays = iPrevConDays;
				}
			}
		}
		else
		{
			// 考慮空白天當成DO的情況, 故設計成以非休息的duty為基準
			// 目標勤務的前面有幾天DO, 後面有幾天DO, 要等到下個勤務出現才能確定
			// 外籍組員不在homebase產生的空白天是layover, 視為連續勤務
			if (!isAtHomebase)
			{
				iCurrentConDays = 0;
			}
			else if (iDutyStartTime - iCurrentConStartTime >= TIME_DAY &&
				iDutyStartTime - iCurrentConStartTime < (iConBlankDaysAsDO + 1) * TIME_DAY)
			{
				iCurrentConDays = (iDutyStartTime - iCurrentConStartTime) / TIME_DAY;
			}

			// 優化時若兩段空白天大於gap days則不限制, 預佔勤務也不限制
			if (iPrevConStartTime > 0 &&
				iCurrentConStartTime - iPrevConStartTime < TIME_DAY * (iParamGapDays + iPrevConDays) &&
				!(this->application == ROSTER_OPTIMIZER && isPrevDutyPA))
			{
				// 如果第一段連續DO符合條件一或條件二, 第二段就必須符合另一個條件
				if ((iPrevConDays >= iParamFirstDays && iCurrentConDays >= iParamSecondDays) ||
					(iPrevConDays >= iParamSecondDays && iCurrentConDays >= iParamFirstDays))
				{
					isError = true;
					iErrorStartTime = iPrevConStartTime;
					iErrorConDays = iPrevConDays;
				}
			}

			if (isAtHomebase && iPrevDutyEndNextDate > 0 && iDutyStartTime - iCurrentConStartTime >= TIME_DAY)
			{
				if (iDutyStartTime - iPrevDutyEndNextDate >= (iConBlankDaysAsDO + 1) * TIME_DAY)
				{
					iCurrentConDays = 0; // 前面的空白天過長, DO已經不連續
				}
				iPrevConStartTime = iCurrentConStartTime;
				iPrevConDays = iCurrentConDays;
				isPrevDutyPA = ((*iter_roster)->source == "PA");
			}
			else
			{
				isPrevDutyPA |= ((*iter_roster)->source == "PA");
			}
			iCurrentConStartTime = iDutyEndNextDate;
			iCurrentConDays = 0;
		}

		iPrevDutyEndNextDate = iDutyEndNextDate;

		// 從外籍組員的國家出發的MVO/MVP
		if (isExpatCrew && this->dbData->findAirportCountry((*iter_roster)->getBase()) == crew->nationality &&
			((*iter_roster)->duty == "MVO" || (*iter_roster)->duty == "MVP"))
		{
			isAtHomebase = false;
		}
		else if (isExpatCrew && this->dbData->findAirportCountry((*iter_roster)->getBase()) != crew->nationality &&
			(*iter_roster)->duty != "MVO" && (*iter_roster)->duty != "MVP")
		{
			isAtHomebase = false;
		}
		else
		{
			isAtHomebase = true;
		}


		if (isError)
		{
			CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
			rv->isLegal = false;
			rv->startUtc = iErrorStartTime;
			rv->endUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(iDutyStartTime, iOffset) - TIME_MINUTE;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->legalMessage = strRosterLabel +
				" after " +
				boost::lexical_cast<string>(iErrorConDays)+
				" consecutive " +
				strConsecutiveAssignments +
				" gaps only 1 day - minimum " +
				boost::lexical_cast<string>(iParamGapDays)+
				(iParamGapDays > 1 ? " days" : " day");
			rv->operation_result.insert(make_pair("rosterLabel", strRosterLabel));
			rv->operation_result.insert(make_pair("errorConDays", boost::lexical_cast<string>(iErrorConDays)));
			rv->operation_result.insert(make_pair("assignments", strConsecutiveAssignments));
			rv->operation_result.insert(make_pair("minGap", boost::lexical_cast<string>(iParamGapDays)));
			rv->operation_result.insert(make_pair("gapUnit", iParamGapDays > 1 ? "days" : "day"));

			rvs.push_back(rv);
			if (this->application == ROSTER_OPTIMIZER)
			{
				return rvs;
			}
		}

		if (find(gapAssignmentGroups.begin(), gapAssignmentGroups.end(), (*iter_roster)->duty) != gapAssignmentGroups.end())
		{
			strRosterLabel = (*iter_roster)->label;
			if (strRosterLabel.length() == 0)
			{
				strRosterLabel = (*iter_roster)->qualifier;
			}
		}
		isError = false;
	}

	// 如果Gap Days > 2, 目的就是要規範連續服勤的長度
	// 就要考慮從最後一個勤務到scenario結束時間的空白日
	if (iParamGapDays > 2 && iDutyEndNextDate > 0 && iDutyEndNextDate < this->dbData->endUtc + 8 * TIME_DAY)
	{
		iCurrentConDays = (this->dbData->endUtc + 8 * TIME_DAY - iCurrentConStartTime) / TIME_DAY + 1;

		if (iPrevConStartTime > 0 &&
			iCurrentConStartTime - iPrevConStartTime < TIME_DAY * (iParamGapDays + iPrevConDays) &&
			!(this->application == ROSTER_OPTIMIZER && isPrevDutyPA) &&
			((iPrevConDays >= iParamFirstDays && iCurrentConDays >= iParamSecondDays) ||
			(iPrevConDays >= iParamSecondDays && iCurrentConDays >= iParamFirstDays)))
		{
			CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
			rv->isLegal = false;
			rv->startUtc = iPrevConStartTime;
			rv->endUtc = this->dbData->endUtc + 8 * TIME_DAY;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->legalMessage = strRosterLabel +
				" after " +
				boost::lexical_cast<string>(iErrorConDays)+
				" consecutive " +
				strConsecutiveAssignments +
				" gaps only 1 day - minimum " +
				boost::lexical_cast<string>(iParamGapDays)+
				(iParamGapDays > 1 ? " days" : " day");
			rv->operation_result.insert(make_pair("rosterLabel", strRosterLabel));
			rv->operation_result.insert(make_pair("errorConDays", boost::lexical_cast<string>(iErrorConDays)));
			rv->operation_result.insert(make_pair("assignments", strConsecutiveAssignments));
			rv->operation_result.insert(make_pair("minGap", boost::lexical_cast<string>(iParamGapDays)));
			rv->operation_result.insert(make_pair("gapUnit", iParamGapDays > 1 ? "days" : "day"));

			rvs.push_back(rv);
		}
	}

	return rvs;
}

// 9007, LHSBbfConDO: No X consecutive DO after Long Haul and Ultra Long Haul Standby duty.
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkLHSBBeforeConsecutiveDOs(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	map<string, string> ruleParams = singleRule->params;
	map<string, string>::iterator iter_params;
	vector<string> crewNationalities;
	vector<string> sbyAssignmentGroups;
	string strStandbyGroups;
	int  iMinConsecutiveDO, iMinGapDays;
	int  iConBlankDaysAsDO = 0;	// 最大的連續空白日當成DO, 例如設為2表示2天以內的空白天視為DO, 3天就不算
	int  iOffset;
	int  iPrevDODate, iCurrentDODate;
	long iSbyStartTime;			// LHSB的勤務開始時間
	long iSbyEndDate;			// LHSB的勤務結束日期
	long iPrevDutyEndDate;		// 紀錄非DO勤務的結束日期, 當空白日視為DO時, 用來計算連續DO日數
	long iPrevRosterEndDate;	// 紀錄上個包括DO的勤務結束日期
	long iCurrRosterStartDate;	// 紀錄目前包括DO的勤務開始日期
	long iCurrRosterEndDate;	// 紀錄目前包括DO的勤務結束日期
	int  iRosterIndex;			// LHSB的Roster Index
	long iConDOStartDate;		// 連續DO的起始日期
	int  iConDODays;			// 連續DO或空白日的日數
	int  iGapDays;				// LHSB和連續DO的間隔日數
	long iPAStartTime;			// 紀錄連續PA(Pre-Assigned)勤務的開始時間
	string strMinGapUnit;
	string strStandbyLabel;
	char date_buf[30];

	for (iter_params = ruleParams.begin(); iter_params != ruleParams.end(); iter_params++)
	{
		if (iter_params->first == "NATIONALITIES")
		{
			if (iter_params->second != "*")
			{
				boost::split(crewNationalities, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
				if (find(crewNationalities.begin(), crewNationalities.end(), crew->nationality) == crewNationalities.end())
				{
					//  不符合定義的組員國籍
					return rvs;
				}
			}
		}
		else if (iter_params->first == "PAIRING QUALIFIERS")
		{
			strStandbyGroups = iter_params->second;
			boost::split(sbyAssignmentGroups, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "MIN CONSECUTIVE DO")
		{
			iMinConsecutiveDO = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "MIN GAP")
		{
			iMinGapDays = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "MIN GAP UNIT")
		{
			strMinGapUnit = iter_params->second;
		}
		else if (iter_params->first == "CONSECUTIVE BLANK DAYS AS DO")
		{
			iConBlankDaysAsDO = boost::lexical_cast<int>(iter_params->second);
		}
	}

	iOffset = TPE_OFFSET;
	iPrevDODate = 0;
	iConDODays = 0;
	iPrevDutyEndDate = 0;
	iPrevRosterEndDate = 0;
	iCurrRosterStartDate = 0;
	iSbyEndDate = 0;
	iPAStartTime = 0;
	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if ((*iter_roster)->source == "PA")
		{
			if (iPAStartTime == 0)
			{
				iPAStartTime = static_cast<long>((*iter_roster)->actStrUtc);
			}
		}
		else
		{
			iPAStartTime = 0;
		}

		///mod by ain 20170318: add condition 'roster.pairing == NULL'
		if ((*iter_roster)->pairing && find(sbyAssignmentGroups.begin(), sbyAssignmentGroups.end(), (*iter_roster)->pairing->getQualifier()) != sbyAssignmentGroups.end())
		{
			strStandbyLabel = (*iter_roster)->label;
			iRosterIndex = std::distance(vRoster.begin(), iter_roster);
			util_timeT_to_dateStr((*iter_roster)->actStrUtc, date_buf, sizeof(date_buf));
			iSbyStartTime = static_cast<long>((*iter_roster)->actStrUtc);
			iSbyEndDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actRestStrUtc), iOffset) / TIME_DAY;
			iPrevDutyEndDate = iSbyEndDate;
			iPrevRosterEndDate = iSbyEndDate;
			iConDOStartDate = iSbyEndDate + 1;
			iPrevDODate = 0;
			iConDODays = 0;
		}
		else if (iConBlankDaysAsDO == 0)
		{
			if ((*iter_roster)->qualifier == "DO")
			{
				iCurrentDODate = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), iOffset) / TIME_DAY;
				if (iPrevDODate == 0 || iCurrentDODate - iPrevDODate > 1)
				{
					// 第一個DO或是和前面的DO不連續
					iConDOStartDate = iCurrentDODate;
					iConDODays = 1;
				}
				else if (iCurrentDODate - iPrevDODate == 1)
				{
					// 連續的DO
					iConDODays++;
				}
				iGapDays = iConDOStartDate - iSbyEndDate - 1;
				iPrevDODate = iCurrentDODate;
			}
			else
			{
				iConDODays = 0;
				iPrevDODate = iCurrentDODate = 0;
			}
		}
		else // 將空白天視為DO
		{
			iCurrRosterStartDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), iOffset) / TIME_DAY;
			iCurrRosterEndDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actRestStrUtc), iOffset) / TIME_DAY;
			if (this->application == ROSTER_OPTIMIZER && iPrevRosterEndDate > 0 && iCurrRosterStartDate - iPrevRosterEndDate > iConBlankDaysAsDO + 1)
			{
				// 已超過連續空白天的限制, 優化時將勤務開始日期(用來計算連續DO的結束日期)訂為上個勤務結束日期的隔天
				iCurrRosterStartDate = iPrevRosterEndDate + 1;
				//iPrevDutyEndDate = iCurrRosterEndDate;
			}
			iPrevRosterEndDate = iCurrRosterEndDate;

			// 除了DO之外的任意兩個勤務之間的間隔日數就是連續DO日數
			if ((*iter_roster)->qualifier != "DO")
			{
				if (iPrevDutyEndDate != 0)
				{
					iConDOStartDate = iPrevDutyEndDate + 1;
					iConDODays = iCurrRosterStartDate - iConDOStartDate;
					iGapDays = iConDOStartDate - iSbyEndDate - 1;
				}
				iPrevDutyEndDate = iPrevRosterEndDate;
				iConDOStartDate = iPrevDutyEndDate + 1;
			}
			else
			{
				iGapDays = iConDOStartDate - iSbyEndDate - 1;
				iConDODays = iCurrRosterStartDate - iConDOStartDate + 1;
			}
		}

		// 考慮空白天為DO時, 只有最後一個DO才要檢查, 避免顯示重複的錯誤訊息
		if (iConBlankDaysAsDO > 0 && (*iter_roster)->qualifier == "DO" && iter_roster < vRoster.end() - 1)
		{
			continue;
		}

		// 如果LHSB(含)之後的勤務全都是PA但違反法規, 優化仍視為合法
		if (!(this->application == ROSTER_OPTIMIZER && iPAStartTime > 0 && iPAStartTime <= iSbyStartTime) &&
			iConDODays >= iMinConsecutiveDO && iGapDays < iMinGapDays && iSbyEndDate > 0)
		{
			CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
			rv->isLegal = false;
			rv->startUtc = iSbyStartTime;
			rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->legalMessage = "No " +
				boost::lexical_cast<string>(iConDODays)+
				" consecutive DOs after " +
				strStandbyLabel +
				" on " +
				string(date_buf) +
				" - Minimum " +
				boost::lexical_cast<string>(iMinGapDays)+
				(iMinGapDays > 1 ? " days" : " day") +
				" between " +
				strStandbyGroups +
				" and DOs";
			rv->operation_result.insert(make_pair("conDODays", boost::lexical_cast<string>(iConDODays)));
			rv->operation_result.insert(make_pair("standbyLabel", strStandbyLabel));
			rv->operation_result.insert(make_pair("minGap", boost::lexical_cast<string>(iMinGapDays)));
			rv->operation_result.insert(make_pair("gapUnit", iMinGapDays > 1 ? "days" : "day"));
			rv->operation_result.insert(make_pair("standbyGroups", strStandbyGroups));

			rvs.push_back(rv);
			if (this->application == ROSTER_OPTIMIZER)
			{
				return rvs;
			}
		}
	}
	return rvs;
}

// 9008, LHBT: Max BH of total LH pattern should not exceed X% of BH in a calendar month. 
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkMaxBHOfTotalLH(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	vector<SharedPtr<CREW_BASE>> vCrewBase = crew->baseList;
	map<string, string> ruleParams = singleRule->params;
	map<string, string>::iterator iter_params;
	string strBases, strRanks, strFleets;
	string strParamPeriod, strParamUnit;
	vector<string> patternQualifiers;
	int iTargetTotalBH; // 目標總BH, 計算到分
	int iMaxPercentage;
	vector<string> workingDuties;
	int iPeriod;
	int iOffset;
	long iScenarioStartTime, iScenarioEndTime;
	map<time_t, time_t> mpRanges;
	vector<long> vMonthStartTime;
	int iMonthDays;
	long iAvailableDays;
	bool isLongHaulFlight;
	long iTotalBH, iTotalLHBH;
	long iRosterStartTime, iRosterEndTime;
	float targetLHBH;
	bool isNewLH;
	int iDO_Days; //統計當月預佔的DO

	for (iter_params = ruleParams.begin(); iter_params != ruleParams.end(); iter_params++)
	{
		if (iter_params->first == "BASES")
		{
			strBases = iter_params->second;
		}
		else if (iter_params->first == "RANKS")
		{
			strRanks = iter_params->second;
		}
		else if (iter_params->first == "FLEETS")
		{
			strFleets = iter_params->second;
		}
		else if (iter_params->first == "PATTERN QUALIFIERS")
		{
			boost::split(patternQualifiers, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "TARGET TOTAL BH")
		{
			iTargetTotalBH = ConvertHHMMtoSeconds(iter_params->second) / 60;
			if (iTargetTotalBH < 0) return rvs;

		}
		else if (iter_params->first == "MAX BH(%)")
		{
			iMaxPercentage = boost::lexical_cast<int>(iter_params->second);
		}
		else if (iter_params->first == "WORKING DUTIES")
		{
			boost::split(workingDuties, iter_params->second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter_params->first == "PERIOD")
		{
			strParamPeriod = iter_params->second;
			iPeriod = boost::lexical_cast<int>(strParamPeriod);
		}
		else if (iter_params->first == "UNIT")
		{
			strParamUnit = iter_params->second;
		}
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	// 檢查roster裡面是否有新優化上的長班飛航勤務
	if (this->application == ROSTER_OPTIMIZER)
	{
		isNewLH = false;
		for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
		{
			if ((*iter_roster)->needRuleCheck == true)
			{
				// 優化時如果新增長班勤務, 就必須檢查這條法規
				if (find(patternQualifiers.begin(), patternQualifiers.end(), (*iter_roster)->qualifier) != patternQualifiers.end())
				{
					isNewLH = true;
					break;
				}
			}
		}

		// 這條法規的目的是限制長班飛時, 所以只有塞長班時才需要檢查是否違反法規
		if (!isNewLH)
		{
			return rvs;
		}
	}

	iScenarioStartTime = static_cast<long>(this->dbData->scenario.startDtUTC);
	iScenarioEndTime = static_cast<long>(this->dbData->scenario.endDtUTC) + TIME_DAY - 1;
	mpRanges = Utility::GetInstancePtr()->getDateRangeFromLong(strParamUnit, strParamPeriod, iScenarioStartTime, iScenarioEndTime);
	iOffset = TPE_OFFSET;

	for (auto& iter_range : mpRanges)
	{
		if (iter_range.first < iScenarioStartTime)
		{
			continue;
		}

		// 優化時限定LH的BH為Target BH的百分比再乘以可飛天數的比例
		// 可飛天的定義為當月總天數 - 預佔的勤務中不是安排FLY或RB的天數
		iTotalBH = iTotalLHBH = 0;
		iMonthDays = iAvailableDays = (iter_range.second - iter_range.first) / TIME_DAY;
		iDO_Days = 0;
		for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
		{
			iRosterStartTime = static_cast<long>((*iter_roster)->actStrUtc);
			iRosterEndTime = static_cast<long>((*iter_roster)->actRestStrUtc);

			if (iRosterEndTime < iter_range.first)
			{
				continue;
			}
			if (iRosterStartTime >= iter_range.second)
			{
				break;
			}

			if ((*iter_roster)->pairing &&
				find(patternQualifiers.begin(), patternQualifiers.end(), (*iter_roster)->qualifier) != patternQualifiers.end())
			{
				isLongHaulFlight = true;
			}
			else
			{
				isLongHaulFlight = false;
			}

			if (iRosterStartTime >= iter_range.first && iRosterEndTime < iter_range.second)
			{
				if ((*iter_roster)->duty == "FLY")
				{
					vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
					for (vector<Duty *>::iterator iter_duty = duties.begin(); iter_duty != duties.end(); iter_duty++)
					{
						iTotalBH += (*iter_duty)->getBLKInMins();
						if (isLongHaulFlight)
						{
							iTotalLHBH += (*iter_duty)->getBLKInMins();
						}
					}
				}
			}
			else
			{
				if (iRosterStartTime < iter_range.first)
				{
					iRosterStartTime = iter_range.first;
				}
				else if (iRosterEndTime > iter_range.second)
				{
					iRosterEndTime = iter_range.second;
				}

				if ((*iter_roster)->duty == "FLY")
				{
					long iSegmentStartTime;
					long iSegmentEndTime;
					vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
					for (vector<Duty *>::iterator iter_duty = duties.begin(); iter_duty != duties.end(); iter_duty++)
					{
						vector<Segment *> segments = (*iter_duty)->getSegments();
						for (vector<Segment *>::iterator iter_segment = segments.begin(); iter_segment != segments.end(); iter_segment++)
						{
							iSegmentStartTime = (*iter_segment)->getStartTimeUtcSch();
							if (iSegmentStartTime < iter_range.first)
							{
								iSegmentStartTime = iter_range.first;
							}

							iSegmentEndTime = (*iter_segment)->getEndTimeUtcSch();
							if (iSegmentEndTime > iter_range.second)
							{
								iSegmentEndTime = iter_range.second;
							}

							if (iSegmentEndTime > iSegmentStartTime)
							{
								int iBlockTime = (iSegmentEndTime - iSegmentStartTime) / 60;

								if ((*iter_segment)->getAssignment() == "PNC")
								{
									iBlockTime /= 2;
								}

								iTotalBH += iBlockTime;
								if (isLongHaulFlight)
								{
									iTotalLHBH += iBlockTime;
								}
							}
						}
					}
				}
			}

			// 計算可飛天數
			if ((*iter_roster)->source == "PA" &&
				find(workingDuties.begin(), workingDuties.end(), (*iter_roster)->duty) == workingDuties.end())
			{
				if ((*iter_roster)->qualifier == "DO")
				{
					iDO_Days++;

					if (iDO_Days > 8) // DO超過8天的部分才開始扣可飛天數
					{
						iAvailableDays--;
					}
				}
				else
				{
					int iNonFlightDays = (Utility::GetInstancePtr()->getLocalDayStartInUTC(iRosterEndTime, iOffset) -
						Utility::GetInstancePtr()->getLocalDayStartInUTC(iRosterStartTime, iOffset)) / TIME_DAY + 1;
					iAvailableDays -= iNonFlightDays;
				}
			}
		}

		if (this->application == ROSTER_OPTIMIZER)
		{
			targetLHBH = (float)iTargetTotalBH;
			targetLHBH *= ((float)iAvailableDays / iMonthDays) * iMaxPercentage / 100;
			if (iTotalLHBH > targetLHBH)
			{
				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
				rv->isLegal = false;
				rv->startUtc = iter_range.first;
				rv->endUtc = iter_range.second - 1;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->legalMessage = "Total LH pattern BH is " +
					boost::str(boost::format("%02d:%02d") % (iTotalLHBH / 60) % (iTotalLHBH % 60)) +
					" - Exceed " +
					boost::lexical_cast<string>(iMaxPercentage)+
					"% of BH in a month";
				// 優化不用填入operation_result

				rvs.push_back(rv);

				// 優化檢查有錯誤時不用再往下檢查
				return rvs;
			}
		}
		else
		{
			if ((float)iTotalLHBH > ((float)iTotalBH) * iMaxPercentage / 100)
			{
				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
				rv->isLegal = false;
				rv->startUtc = iter_range.first;
				rv->endUtc = iter_range.second - 1;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->legalMessage = "Total LH pattern BH is " +
					boost::str(boost::format("%02d:%02d") % (iTotalLHBH / 60) % (iTotalLHBH % 60)) +
					" (" +
					boost::str(boost::format("%d%%") % ((float)iTotalLHBH * 100 / iTotalBH)) +
					") - Exceed " +
					boost::lexical_cast<string>(iMaxPercentage)+
					"% of BH in a month";
				rv->operation_result.insert(make_pair("totalLHBH_hhmm", boost::str(boost::format("%02d:%02d") % (iTotalLHBH / 60) % (iTotalLHBH % 60))));
				rv->operation_result.insert(make_pair("totalLHBH_percentage", boost::str(boost::format("%d") % ((float)iTotalLHBH * 100 / iTotalBH))));
				rv->operation_result.insert(make_pair("maxPercentage", boost::lexical_cast<string>(iMaxPercentage)));

				rvs.push_back(rv);
			}
		}
	}

	return rvs;
}

// 9009, After operating flights with(1) FDP ≧ X hour(s) and EOD(End of Duty) ≧ HH : MM or(2) FT ≧ hour(s) and EOD(End of Duty) ≧ HH : MM, 
// the moving pattern back to home base should be PNC.
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkJPPNC(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	vector<string> vNationality;
	vector<string> vCommuteType;
	string strParamNationalities, strParamType;
	long iParamWorkTime, iParamEOD;
	long iDutyWorkTime, iDutyEOD;
	long iDutyEndDateTime;  // 飛航勤務結束日期的台北時間00:00
	int iOffset;
	bool isNeedCheck = false;
	bool isPA;
	const char* FMT_VIOLATION = "The moving pattern after operating flights with %s %02d:%02d and EOD %02d:%02d should not be %s";

	for (auto& iter : singleRule->params)
	{
		if (iter.first == "NATIONALITIES")
		{
			strParamNationalities = iter.second;
			if (strParamNationalities != "*")
			{
				boost::split(vNationality, strParamNationalities, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter.first == "FT/FDP")
		{
			strParamType = iter.second;
		}
		else if (iter.first == "FT/FDP HH:MM")
		{
			iParamWorkTime = ConvertHHMMtoSeconds(iter.second);
		}
		else if (iter.first == "EOD")
		{
			iParamEOD = ConvertHHMMtoSeconds(iter.second);
		}
		else if (iter.first == "EXCLUDE POST COMMUTE TYPES")
		{
			boost::split(vCommuteType, iter.second, boost::is_any_of("|"), boost::token_compress_on);
		}
	}

	if (strParamNationalities != "*" &&
		find(vNationality.begin(), vNationality.end(), crew->nationality) == vNationality.end())
	{
		return rvs;
	}

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if (!(*iter_roster)->pairing)
		{
			continue;
		}

		if ((*iter_roster)->duty != "FLY" && (*iter_roster)->duty != "MVO" && (*iter_roster)->duty != "MVP")
		{
			continue;
		}

		// 前一個勤務符合(FDP > 8:00 或 FT > 6:00) 且 EDO > 20:00
		if (isNeedCheck)
		{
			// 如果上個勤務和目前勤務都是Pre-assign, 優化引擎可繼續優化不須檢查
			if (this->application == ROSTER_OPTIMIZER && isPA && (*iter_roster)->source == "PA")
			{
				continue;
			}

			// 檢查前一個勤務的當天或隔天是否為Moving pattern
			if (static_cast<long>((*iter_roster)->actStrUtc) - iDutyEndDateTime < 2 * TIME_DAY)
			{
				if (find(vCommuteType.begin(), vCommuteType.end(), (*iter_roster)->pairing->getPrimeActivity()) != vCommuteType.end())
				{
					char msg[128];
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = iDutyEndDateTime;
					rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
					rv->rosterId = (*iter_roster)->rosterId;
					rv->pairingId = (*iter_roster)->pairId;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					sprintf_s(msg, sizeof(msg), FMT_VIOLATION,
						strParamType.c_str(),
						iDutyWorkTime / 3600, (iDutyWorkTime / 60) % 60,
						iDutyEOD / 3600, (iDutyEOD / 60) % 60,
						(*iter_roster)->pairing->getPrimeActivity().c_str());
					rv->legalMessage = msg;
					rv->operation_result.insert(make_pair("ftFdp_type", strParamType));
					rv->operation_result.insert(make_pair("ftFdp_hhmm", boost::str(boost::format("%d:%02d") % (iDutyWorkTime / 3600) % ((iDutyWorkTime / 60) % 60))));
					rv->operation_result.insert(make_pair("eod_hhmm", boost::str(boost::format("%d:%02d") % (iDutyEOD / 3600) % ((iDutyEOD / 60) % 60))));
					rv->operation_result.insert(make_pair("commuteType", (*iter_roster)->pairing->getPrimeActivity()));

					rvs.push_back(rv);
					if (this->application == ROSTER_OPTIMIZER)
					{
						return rvs;
					}
				}
			}
		}

		isNeedCheck = false;
		iOffset = this->dbData->getAirportOffset((*iter_roster)->getBase());
		iDutyEndDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actRestStrUtc), iOffset);

		// 結束時間在20:00之後
		iDutyEOD = static_cast<long>((*iter_roster)->actRestStrUtc - iDutyEndDateTime);
		if (iDutyEOD >= iParamEOD)
		{
			vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
			if (duties.size() > 0)
			{
				vector<Duty *>::reverse_iterator iter_duty = duties.rbegin();
				if (strParamType == "FT")
				{
					iDutyWorkTime = static_cast<long>((*iter_duty)->getFlyHours() * TIME_HOUR);
				}
				else if (strParamType == "FDP")
				{
					iDutyWorkTime = (*iter_duty)->getFDPInSecs();
				}
				else if (strParamType == "DP")
				{
					iDutyWorkTime = (*iter_duty)->getDPInSecs();
				}

				if (iDutyWorkTime >= iParamWorkTime)
				{
					isNeedCheck = true;
					isPA = ((*iter_roster)->source == "PA");
				}
			}
		}
	}

	return rvs;
}

// 9010, Restriction JP cabin crew roster in TWN
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkJP5DayDuty(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	vector<SharedPtr<DBRule_8014>> assignments = this->dbData->rule_8014;
	vector<string> excludeAssignmentGroups;
	vector<string> excludeAssignments;
	vector<string> restAssignments;
	vector<string> vNationality;
	vector<string> vPatternAttribute;
	int iParamMaxDuty, iParamLeastPNC;
	int iTotalDuty = 0, iTotalMVP = 0, iTotalConsecutiveTurnAround = 0;
	int iOffset;
	string strDepatureCountry;
	string strAttribute;
	long iCommuteToTwTime = this->dbData->startUtc - atoi(this->dbData->systemParamMap["DEFAULT_LEADIN_DAYS_PRIOR_ROSTER_PERIOD"].c_str()) * TIME_DAY;
	long iPrevDutyEndTime = iCommuteToTwTime;
	long iDutyStartDateTime; // 勤務開始日期的00:00
	long iDutyEndTime;
	bool isTurnAround;
	bool isAllPA = true;
	bool isMovingPA = true;
	char date_buf_from[30], date_buf_to[30];
	char msg[128];
	const char* FMT_VIOLATION_MAX_DUTY = "Number of duty after CMT is %d from %s to %s, exceed the limit of %d";
	const char* FMT_VIOLATION_LEAST_PNC = "Number of PNC CMT is %d from %s to %s, less than the requirement of %d PNC CMT";

	for (auto& iter : singleRule->params)
	{
		if (iter.first == "NATIONALITIES")
		{
			boost::split(vNationality, iter.second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "MAX NUMBER OF DUTY")
		{
			iParamMaxDuty = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "CONSECUTIVE PATTERN ATTRIBUTES")
		{
			boost::split(vPatternAttribute, iter.second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "LEAST PNC CMT WHEN MAX CONSECUTIVE ATTRIBUTES")
		{
			iParamLeastPNC = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "EXCLUDE ASSIGNMENT GROUPS")
		{
			boost::split(excludeAssignmentGroups, iter.second, boost::is_any_of("|"), boost::token_compress_on);
		}
	}

	if (find(vNationality.begin(), vNationality.end(), crew->nationality) == vNationality.end())
	{
		return rvs;
	}

	// Collect rest assignment definition
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->airline == this->dbData->scenario.airline)
		{
			if ((*assignment)->assignmentGroup == "REST")
			{
				restAssignments.push_back((*assignment)->assignemnt);
			}

			if (find(excludeAssignmentGroups.begin(), excludeAssignmentGroups.end(), (*assignment)->assignmentGroup) != excludeAssignmentGroups.end())
			{
				excludeAssignments.push_back((*assignment)->assignemnt);
			}
		}
	}

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		strDepatureCountry = this->dbData->findAirportCountry((*iter_roster)->getBase());
		iOffset = this->dbData->getAirportOffset((*iter_roster)->getBase());
		iDutyStartDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), iOffset);
		iDutyEndTime = static_cast<long>((*iter_roster)->restStrUtc);

		// mantis#3433, 結束時間早於甘特圖起始時間的勤務不檢查
		if (iDutyEndTime < iCommuteToTwTime)
		{
			continue;
		}

		// 將休息除外
		// mantis#2701 - DO之後重新統計連續勤務的數量
		if (find(restAssignments.begin(), restAssignments.end(), (*iter_roster)->duty) != restAssignments.end())
		{
			iTotalDuty = 0;
			iTotalConsecutiveTurnAround = 0;
			iTotalMVP = 0;
			iCommuteToTwTime = iDutyEndTime;
			continue;
		}

		// mantis#2873 - 地面勤務不檢查
		if (find(excludeAssignments.begin(), excludeAssignments.end(), (*iter_roster)->duty) != excludeAssignments.end())
		{
			continue;
		}

		if (((*iter_roster)->duty == "MVO" || (*iter_roster)->duty == "MVP"))
		{
			if (find(vNationality.begin(), vNationality.end(), strDepatureCountry) != vNationality.end())
			{
				// from JP to TW
				iTotalDuty = 0;
				iTotalConsecutiveTurnAround = 0;
				iTotalMVP = 0;
				iCommuteToTwTime = static_cast<long>((*iter_roster)->actRestStrUtc);
				if ((*iter_roster)->duty == "MVP")
				{
					iTotalMVP++;
				}
				// mantis#2701 - 如果預佔的勤務已違反法規, 還是要讓組員可以安排moving
				//isAllPA = ((*iter_roster)->source == "PA");
				// mantis#2783 - moving來台之後把isAllPA設為true
				isAllPA = true;
				isMovingPA = ((*iter_roster)->source == "PA");
			}
			else if (strDepatureCountry == "TW")
			{
				// from TW to JP
				if ((*iter_roster)->duty == "MVP")
				{
					iTotalMVP++;
				}
				// mantis#2701 - 如果預佔的勤務已違反法規, 還是要讓組員可以安排moving
				//isAllPA &= ((*iter_roster)->source == "PA");

				// mantus#2566 - 不用考慮在台有空白天的問題, 因為9012法規也不會允許有兩天layover
				/*if (iDutyStartDateTime - iPrevDutyEndTime > 2 * TIME_DAY)
				{
				// 如果和前一個勤務差距兩天以上就重設在台勤務的數量, 因為兩天就可以moving回去再moving來台
				iTotalDuty = 0;
				}
				else if (iDutyStartDateTime - iPrevDutyEndTime > TIME_DAY)*/
				if (iDutyStartDateTime - iPrevDutyEndTime > TIME_DAY)
				{
					// 飛航勤務和前一個勤務沒有連續
					iTotalConsecutiveTurnAround = 0;
				}
				isMovingPA &= ((*iter_roster)->source == "PA");

				if (iTotalDuty == iParamMaxDuty && iTotalConsecutiveTurnAround == iParamMaxDuty && iTotalMVP < iParamLeastPNC &&
					!(this->application == ROSTER_OPTIMIZER && isAllPA && isMovingPA))
				{
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = iCommuteToTwTime;
					rv->endUtc = iDutyEndTime;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					util_timeT_to_dateStr(iCommuteToTwTime, date_buf_from, sizeof(date_buf_from));
					util_timeT_to_dateStr(iDutyEndTime, date_buf_to, sizeof(date_buf_to));
					sprintf_s(msg, sizeof(msg), FMT_VIOLATION_LEAST_PNC, iTotalMVP, date_buf_from, date_buf_to, iParamLeastPNC);
					rv->legalMessage = msg;
					rv->operation_result.insert(make_pair("total", boost::lexical_cast<string>(iTotalDuty)));
					rv->operation_result.insert(make_pair("pncCmt", boost::lexical_cast<string>(iTotalMVP)));
					rv->operation_result.insert(make_pair("limit", boost::lexical_cast<string>(iParamLeastPNC)));
					rv->msg_type = 2;

					rvs.push_back(rv);
					if (this->application == ROSTER_OPTIMIZER)
					{
						return rvs;
					}
				}
				// mantis#2783 - 組員回基地後把預佔的flag都回復成預設值
				iTotalDuty = 0;
				iTotalConsecutiveTurnAround = 0;
				iTotalMVP = 0;
				iCommuteToTwTime = iDutyEndTime;
				isAllPA = true;
				isMovingPA = true;
			}
		}
		else
		{
			if (this->dbData->findAirportCountry((*iter_roster)->getBase()) != this->dbData->findAirportCountry(crew->getPrimeBase()))
			{
				// mantis#2712 - 考慮優化可能先安排勤務再安排moving, 還是要做以下檢查
				if (iDutyStartDateTime - iPrevDutyEndTime > 3 * TIME_DAY)
				{
					// 如果和前一個勤務差距三天以上就重新計算在台勤務的數量
					iTotalDuty = 1;
					iTotalConsecutiveTurnAround = 0;
					isAllPA = ((*iter_roster)->source == "PA");
				}
				else
				{
					iTotalDuty++;
					isAllPA &= ((*iter_roster)->source == "PA");
				}
			}
			else
			{
				// 組員在homebase的勤務不須檢查9010法規, 且視為已經中斷連續勤務
				iTotalDuty = 0;
				iTotalConsecutiveTurnAround = 0;
				iCommuteToTwTime = iDutyEndTime;
				iTotalMVP = 0;
				isAllPA = true;
				isMovingPA = true;
			}

			if (iTotalDuty > iParamMaxDuty && !(this->application == ROSTER_OPTIMIZER && isAllPA))
			{
				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
				rv->isLegal = false;
				rv->startUtc = iCommuteToTwTime;
				rv->endUtc = iDutyEndTime;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				util_timeT_to_dateStr(iCommuteToTwTime, date_buf_from, sizeof(date_buf_from));
				util_timeT_to_dateStr(iDutyEndTime, date_buf_to, sizeof(date_buf_to));
				sprintf_s(msg, sizeof(msg), FMT_VIOLATION_MAX_DUTY, iTotalDuty, date_buf_from, date_buf_to, iParamMaxDuty);
				rv->legalMessage = msg;
				rv->operation_result.insert(make_pair("total", boost::lexical_cast<string>(iTotalDuty)));
				rv->operation_result.insert(make_pair("limit", boost::lexical_cast<string>(iParamMaxDuty)));
				rv->msg_type = 1;

				rvs.push_back(rv);
				if (this->application == ROSTER_OPTIMIZER)
				{
					return rvs;
				}
			}
			isTurnAround = false;
			if (iDutyStartDateTime - iPrevDutyEndTime <= TIME_DAY && (*iter_roster)->pairing)
			{
				strAttribute = (*iter_roster)->pairing->getAttribute();
				for (auto& iter_attribute : vPatternAttribute)
				{
					if (strAttribute.find(iter_attribute) != string::npos)
					{
						isTurnAround = true;
						break;
					}
				}
			}

			if (isTurnAround)
			{
				iTotalConsecutiveTurnAround++;
			}
			else
			{
				iTotalConsecutiveTurnAround = 0;
			}

			if (iCommuteToTwTime == 0)
			{
				iCommuteToTwTime = iDutyStartDateTime;
			}
		}

		iPrevDutyEndTime = iDutyEndTime;
	}

	return rvs;
}

// 9011, Expat crew operation moving requirement
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkExpatOprMoving(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	int iParamGapDays, iParamNoofDuty, iParamOprSectors, iParamLeastOprMoving;
	string strParamAttributes;
	vector<string> vPatternAttribute;
	int iTotalDuties = 0, iTotalOprMoving = 0, iGapDays, iTotalOprSectors = 0;
	int iOffset;
	string strDepartureCountry;
	bool isAllPA = false;
	bool isAttributeMatched = false;
	long iDutyStartDateTime;
	long iCommuteToTwTime = 0;
	char date_buf_from[30], date_buf_to[30];
	char msg[128];
	const char* FMT_VIOLATION = "%d OPR moving is required from %s to %s";

	for (auto& iter : singleRule->params)
	{
		if (iter.first == "GAP DAYS BETWEEN 2 MOVINGS")
		{
			iParamGapDays = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "NUMBER OF DUTY BETWEEN 2 MOVINGS")
		{
			iParamNoofDuty = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "MAX OPR SECTORS BETWEEN 2 MOVINGS")
		{
			iParamOprSectors = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "PATTERN ATTRIBUTES")
		{
			strParamAttributes = iter.second;
			if (strParamAttributes != "*")
			{
				boost::split(vPatternAttribute, strParamAttributes, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter.first == "LEAST OPR MOVING ASSIGNED")
		{
			iParamLeastOprMoving = boost::lexical_cast<int>(iter.second);
		}
	}

	if (crew->nationality == "TW")
	{
		return rvs;
	}

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		iOffset = this->dbData->getAirportOffset((*iter_roster)->getBase());
		iDutyStartDateTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>((*iter_roster)->actStrUtc), iOffset);
		if ((*iter_roster)->duty == "MVO" || (*iter_roster)->duty == "MVP")
		{
			strDepartureCountry = this->dbData->findAirportCountry((*iter_roster)->getBase());
			if (strDepartureCountry != "TW") // moving to TW
			{
				iTotalOprMoving = 0;
				iGapDays = 0;
				iTotalDuties = 0;
				iTotalOprSectors = 0;
				isAttributeMatched = false;
				iCommuteToTwTime = static_cast<long>((*iter_roster)->actRestStrUtc);
				if ((*iter_roster)->duty == "MVO")
				{
					iTotalOprMoving++;
				}
				isAllPA = ((*iter_roster)->source == "PA");
			}
			else // moving back to home base
			{
				if ((*iter_roster)->duty == "MVO")
				{
					iTotalOprMoving++;
				}
				isAllPA &= ((*iter_roster)->source == "PA");
				iGapDays = (iDutyStartDateTime - iCommuteToTwTime) / TIME_DAY;

				// 來台只要服勤兩個勤務以上就不限制
				// 目前法規只定義了Gap Days在2天以內的情形
				// 因為來台3天以上不會只服勤一個T/R或地面勤務
				if ((*iter_roster)->actRestStrUtc > this->dbData->scenario.startDtUTC &&
					!(this->application == ROSTER_OPTIMIZER && isAllPA) &&
					iTotalOprMoving < iParamLeastOprMoving && (strParamAttributes == "*" || isAttributeMatched) &&
					iGapDays == iParamGapDays && iTotalDuties == iParamNoofDuty && iTotalOprSectors <= iParamOprSectors)
				{
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = iCommuteToTwTime;
					rv->endUtc = static_cast<long>((*iter_roster)->actRestStrUtc);
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					util_timeT_to_dateStr(iCommuteToTwTime, date_buf_from, sizeof(date_buf_from));
					util_timeT_to_dateStr(iDutyStartDateTime, date_buf_to, sizeof(date_buf_to));
					sprintf_s(msg, sizeof(msg), FMT_VIOLATION, iParamLeastOprMoving, date_buf_from, date_buf_to);
					rv->legalMessage = msg;
					rv->operation_result.insert(make_pair("leastMvo", boost::lexical_cast<string>(iParamLeastOprMoving)));

					rvs.push_back(rv);
					if (this->application == ROSTER_OPTIMIZER)
					{
						return rvs;
					}
				}
			}
		}
		else
		{
			isAllPA &= ((*iter_roster)->source == "PA");
			if ((*iter_roster)->duty != "OFF" && (*iter_roster)->duty != "LEA")
			{
				iTotalDuties++;

				if ((*iter_roster)->duty == "FLY" && (*iter_roster)->pairing)
				{
					if (strParamAttributes != "*")
					{
						string strAttributes = (*iter_roster)->pairing->getAttribute();
						for (auto& iter_attribute : vPatternAttribute)
						{
							if (strAttributes.find(iter_attribute) != string::npos)
							{
								isAttributeMatched = true;
								break;
							}
						}
					}

					vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
					for (auto& itDuty : duties)
					{
						vector<Segment *> segments = itDuty->getSegments();
						for (auto& itSegment : segments)
						{
							if (itSegment->getAssignment() == "OPR")
							{
								iTotalOprSectors++;
							}
						}
					}
				}
			}
		}
	}

	return rvs;
}

// 9012, Restriction of expat crew layover in TPE
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkExpatLayover(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	string strBases, strRanks, strFleets, strParamPeriod, strParamUnit, strParamExcludeDuty;
	int iParamMaxLayover, iParamMaxConLayover;
	int iParamAllowableLayoverPirorULR;
	bool bFoundBase = false, bFoundRank = false, bInTaiwan = false, bNeedCheckExclude = false;
	long iCommuteToTwDateTime = 0, iBackToHomeBaseDateTime = 0, iPrevDutyEndNextDate = 0;
	long iDutyStartTime, iDutyEndTime;
	long iScenarioStartTime, iScenarioEndTime;
	long iLayoverStartDate, iLayoverEndDate;
	long iConLayoverStartDate, iConLayoverEndDate;
	string strDepartureCountry;
	int iTotalProsLayover, iTotalProsLayover_PA; // 可能成為Layover的總天數, 要有完整的去回moving才列計Layover
	int iTotalLayoverDays, iTotalLayover_PA;
	int iMaxConLayover; // 紀錄連續Layover的天數
	long iConLayoverStartTime, iConLayoverEndTime; // 紀錄連續Layover的起訖時間
	long iLayOverAfterExcludeDutyStartTime, iLayOverAfterExcludeDutyEndTime; // 紀錄PNC之後的Layover之起訖時間
	bool isPA, isPrevPA, isULR;
	map<time_t, time_t> mpRanges;
	char date_buf_from[30], date_buf_to[30];
	char msg[128];
	const char* FMT_VIOLATION_PNC = "Before or after L/O assignment cannot be %s";
	const char* FMT_VIOLATION_CON = "%d consecutive L/O exceed the limitation of %d";
	const char* FMT_VIOLATION_PERIOD = "%d L/O days(%s - %s) in %s %s exceed the limitation of %d";

	for (auto& iter : singleRule->params)
	{
		if (iter.first == "BASES")
		{
			strBases = iter.second;
		}
		else if (iter.first == "RANKS")
		{
			strRanks = iter.second;
		}
		else if (iter.first == "FLEETS")
		{
			strFleets = iter.second;
		}
		else if (iter.first == "MAX L/O")
		{
			iParamMaxLayover = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "PERIOD")
		{
			strParamPeriod = iter.second;
		}
		else if (iter.first == "UNIT")
		{
			strParamUnit = iter.second;
		}
		else if (iter.first == "MAX CONSECUTIVE L/O")
		{
			iParamMaxConLayover = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "EXCLUDE DUTY BEFORE/AFTER L/O")
		{
			strParamExcludeDuty = iter.second;
		}
		else if (iter.first == "ALLOWABLE L/O DAYS PRIOR TO ULR")
		{
			iParamAllowableLayoverPirorULR = boost::lexical_cast<int>(iter.second);
		}
	}

	// 本籍組員不檢查
	if (crew->nationality == "TW")
	{
		return rvs;
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	iScenarioStartTime = static_cast<long>(this->dbData->scenario.startDtUTC);
	iScenarioEndTime = static_cast<long>(this->dbData->scenario.endDtUTC) + TIME_DAY - 1;
	mpRanges = Utility::GetInstancePtr()->getDateRangeFromLong(strParamUnit, strParamPeriod, iScenarioStartTime, iScenarioEndTime);
	for (auto& iter_range : mpRanges)
	{
		if (iter_range.first < iScenarioStartTime)
		{
			continue;
		}

		iPrevDutyEndNextDate = 0;
		bInTaiwan = false;
		bNeedCheckExclude = false;
		iTotalLayoverDays = 0;
		iTotalLayover_PA = 0;
		iTotalProsLayover = 0;
		iTotalProsLayover_PA = 0;
		iMaxConLayover = 0;
		iLayoverStartDate = 0;
		iLayoverEndDate = 0;
		iLayOverAfterExcludeDutyStartTime = 0;
		iLayOverAfterExcludeDutyEndTime = 0;
		isPrevPA = true;
		for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
		{
			iDutyStartTime = static_cast<long>((*iter_roster)->actStrUtc);
			iDutyEndTime = static_cast<long>((*iter_roster)->actRestStrUtc);

			// mantis#2566 - 避免上月底就moving來台, 卻沒有考慮到
			/*if (iDutyEndTime < iter_range.first || iPrevDutyEndNextDate >= (iter_range.second + TIME_DAY))
			{
			continue;
			}*/
			// mantis#2831 - 在homebase發生的OFF, LEA不應列計L/O
			//if ((*iter_roster)->duty == "OFF" || (*iter_roster)->duty == "LEA" || (*iter_roster)->qualifier == "L/O")
			if ((*iter_roster)->qualifier == "L/O") // L/O當成空白天處理
			{
				continue;
			}

			isPA = ((*iter_roster)->source == "PA");
			isULR = false;

			// mantis#2563 - 原本為了避免預佔有月初來台的半環加上月底離台的半環形成違反9012法規的大環
			// 但如果優化引擎無法拆分成數個小環, 9012法規通過也沒意義, 因此移除這個例外處理
			/*if (iPrevDutyEndNextDate > 0 && iDutyStartTime - iPrevDutyEndNextDate > 3 * TIME_DAY && this->application == ROSTER_OPTIMIZER)
			{
			// 優化時勤務之間有3天以上的空白天不檢查
			bNeedCheckExclude = false;
			bInTaiwan = false;
			}
			else if (bInTaiwan && iDutyStartTime - iPrevDutyEndNextDate > TIME_DAY)*/
			// mantis#4534, 完整環內的空白日都要當成layover, 以利user早期發現過大的環然後在預排時切分成較小的環
			if (bInTaiwan && iDutyStartTime - iPrevDutyEndNextDate > TIME_DAY /*&& iDutyStartTime - iPrevDutyEndNextDate < 4 * TIME_DAY*/)
			{
				int iLayover;

				// mantis#2566 - 取得在目標月份區間內的layover
				if (iPrevDutyEndNextDate <= iter_range.second + TIME_DAY && iDutyStartTime >= iter_range.first)
				{
					iPrevDutyEndNextDate = max(iPrevDutyEndNextDate, iter_range.first);
					iDutyStartTime = min(iDutyStartTime, iter_range.second + TIME_DAY);
					iLayover = (iDutyStartTime - iPrevDutyEndNextDate) / TIME_DAY;
				}
				else
				{
					iLayover = 0;
				}

				// 超長程勤務之前的Layover不列入統計
				if (iParamAllowableLayoverPirorULR > 0 && (*iter_roster)->pairing)
				{
					for (int iDutyIndex = 0; iDutyIndex < (*iter_roster)->pairing->getNumDuties(); iDutyIndex++)
					{
						Duty *duty = (*iter_roster)->pairing->getDuty(iDutyIndex);
						if (duty->isULR())
						{
							isULR = true;
							break;
						}
					}
					if (isULR && iLayover <= iParamAllowableLayoverPirorULR) // 超長程之前的Layover以2天為限
					{
						iLayover = 0;
					}
				}

				if (iLayover > 0)
				{
					if (iPrevDutyEndNextDate < iter_range.first)
					{
						iLayover = (iDutyStartTime - static_cast<long>(iter_range.first)) / TIME_DAY;
					}
					else if (iDutyStartTime > iter_range.second)
					{
						iLayover = (static_cast<long>(iter_range.second) - iPrevDutyEndNextDate) / TIME_DAY;
					}
					iTotalProsLayover += iLayover;

					// mantis#2826 - 紀錄Layover的開始結束日期
					if (iLayoverStartDate == 0)
					{
						iLayoverStartDate = iPrevDutyEndNextDate;
					}
					iLayoverEndDate = iPrevDutyEndNextDate + TIME_DAY * (iLayover - 1);

					if (isPrevPA && isPA)
					{
						iTotalProsLayover_PA += iLayover;
					}

					if (iMaxConLayover < iLayover)
					{
						iMaxConLayover = iLayover;
						iConLayoverStartTime = iPrevDutyEndNextDate;
						iConLayoverEndTime = iPrevDutyEndNextDate + TIME_DAY * iLayover - TIME_MINUTE;
					}
				}
			}

			strDepartureCountry = this->dbData->findAirportCountry((*iter_roster)->getBase());
			// 如果前一個勤務是PNC moving來台, 超長程不檢查
			if (bNeedCheckExclude && !isULR)
			{
				// PNC moving後面不能有L/O
				if (iDutyStartTime - iPrevDutyEndNextDate >= TIME_DAY && !(this->application == ROSTER_OPTIMIZER && isPrevPA && isPA))
				{
					iLayOverAfterExcludeDutyStartTime = iPrevDutyEndNextDate;
					iLayOverAfterExcludeDutyEndTime = iDutyStartTime;
				}
			}

			if ((*iter_roster)->duty == "MVO" || (*iter_roster)->duty == "MVP")
			{
				if (strDepartureCountry == "TW")
				{
					// 確認之前有安排moving來台
					if (bInTaiwan)
					{
						// 檢查來台時是否有Layover接在PNC moving之後
						if (iLayOverAfterExcludeDutyStartTime > 0 && iLayOverAfterExcludeDutyStartTime != iPrevDutyEndNextDate)
						{
							CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
							rv->isLegal = false;
							rv->startUtc = iLayOverAfterExcludeDutyStartTime;
							rv->endUtc = iLayOverAfterExcludeDutyEndTime;
							rv->type = VIOLATION_TYPE::CREW_VIOLATION;
							sprintf_s(msg, sizeof(msg), FMT_VIOLATION_PNC, strParamExcludeDuty.c_str());
							rv->legalMessage = msg;
							rv->operation_result.insert(make_pair("excludeDuty", strParamExcludeDuty));
							rv->msg_type = 1;

							rvs.push_back(rv);
							if (this->application == ROSTER_OPTIMIZER)
							{
								return rvs;
							}
						}

						// 檢查PNC moving前不可接Layover
						if ((*iter_roster)->duty == strParamExcludeDuty)
						{
							if (iDutyStartTime - iPrevDutyEndNextDate >= TIME_DAY && !(this->application == ROSTER_OPTIMIZER && isPrevPA && isPA))
							{
								CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
								rv->isLegal = false;
								rv->startUtc = iPrevDutyEndNextDate;
								rv->endUtc = (*iter_roster)->actRestStrUtc;
								rv->type = VIOLATION_TYPE::CREW_VIOLATION;
								sprintf_s(msg, sizeof(msg), FMT_VIOLATION_PNC, strParamExcludeDuty.c_str());
								rv->legalMessage = msg;
								rv->operation_result.insert(make_pair("excludeDuty", strParamExcludeDuty));
								rv->msg_type = 1;

								rvs.push_back(rv);
								if (this->application == ROSTER_OPTIMIZER)
								{
									return rvs;
								}
							}
						}

						// 檢查是否超過連續L/O的限制
						if (iMaxConLayover > iParamMaxConLayover && !(this->application == ROSTER_OPTIMIZER && iTotalProsLayover == iTotalProsLayover_PA))
						{
							CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
							rv->isLegal = false;
							rv->startUtc = iConLayoverStartTime;
							rv->endUtc = iConLayoverEndTime;
							rv->type = VIOLATION_TYPE::CREW_VIOLATION;
							sprintf_s(msg, sizeof(msg), FMT_VIOLATION_CON, iMaxConLayover, iParamMaxConLayover);
							rv->legalMessage = msg;
							rv->operation_result.insert(make_pair("maxConLayover", boost::lexical_cast<string>(iMaxConLayover)));
							rv->operation_result.insert(make_pair("limitConLayover", boost::lexical_cast<string>(iParamMaxConLayover)));
							rv->msg_type = 2;

							rvs.push_back(rv);
							if (this->application == ROSTER_OPTIMIZER)
							{
								return rvs;
							}
						}

						iTotalLayoverDays += iTotalProsLayover;
						iTotalLayover_PA += iTotalProsLayover_PA;
					}

					bInTaiwan = false;
					bNeedCheckExclude = false;
				}
				else
				{
					bInTaiwan = true;
					bNeedCheckExclude = ((*iter_roster)->duty == strParamExcludeDuty);
				}
				iTotalProsLayover = 0;
				iTotalProsLayover_PA = 0;
				iMaxConLayover = 0;
				iLayOverAfterExcludeDutyStartTime = 0;
				iLayOverAfterExcludeDutyEndTime = 0;
			}
			else
			{
				// mantis#2831 - 在homebase發生的OFF, LEA不應列計L/O
				if (this->dbData->findAirportCountry((*iter_roster)->getBase()) == this->dbData->findAirportCountry((crew->getPrimeBase())))
				{
					bInTaiwan = false;
					iTotalProsLayover = 0;
					iTotalProsLayover_PA = 0;
					iMaxConLayover = 0;
				}
				bNeedCheckExclude = false;
			}

			// 只關注在台的勤務所以用台北時區即可, 00:00結束的勤務當作跨日班
			iPrevDutyEndNextDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(iDutyEndTime, TPE_OFFSET) + TIME_DAY;
			isPrevPA = isPA;
		}

		// 如果全部的Layover都是預佔則優化時不報錯
		if (iTotalLayoverDays > iParamMaxLayover && !(this->application == ROSTER_OPTIMIZER && iTotalLayoverDays == iTotalLayover_PA))
		{
			CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
			rv->isLegal = false;
			rv->startUtc = static_cast<long>(iter_range.first);
			rv->endUtc = static_cast<long>(iter_range.second);
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			util_timeT_to_dateStr(iLayoverStartDate + 3 * TIME_HOUR, date_buf_from, sizeof(date_buf_from)); // 從各base的00:00加三小時確保越泰日本時間和台北時間同一天
			util_timeT_to_dateStr(iLayoverEndDate + 3 * TIME_HOUR, date_buf_to, sizeof(date_buf_to));
			sprintf_s(msg, sizeof(msg), FMT_VIOLATION_PERIOD, 
				iTotalLayoverDays, 
				date_buf_from,
				date_buf_to,
				strParamPeriod.c_str(),
				strParamUnit.c_str(), 
				iParamMaxLayover);
			rv->legalMessage = msg;
			rv->operation_result.insert(make_pair("totalLayover", boost::lexical_cast<string>(iTotalLayoverDays)));
			rv->operation_result.insert(make_pair("period", strParamPeriod));
			rv->operation_result.insert(make_pair("unit", strParamUnit));
			rv->operation_result.insert(make_pair("limitLayover", boost::lexical_cast<string>(iParamMaxLayover)));
			rv->msg_type = 3;

			rvs.push_back(rv);

			if (this->application == ROSTER_OPTIMIZER)
			{
				return rvs;
			}
		}
	}
	return rvs;
}

// 9014, No consecutive flight with same destination
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkConsecutiveFlight(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	string strBases, strRanks, strFleets, strParamDestination;
	int iParamMaxConTimes, iOffset;
	bool bMatchDestination;
	bool isAllPA = false;  // 是否連續勤務都是預佔
	int iTotalTimes = 0;
	long iConDutyStartTime = 0, iCurrTargetDutyEndTime, iPrevTargetDutyEndDate = 0;
	char msg[128];
	char date_buf_from[30], date_buf_to[30];
	const char* FMT_VIOLATION = "%d consecutive duties to %s between %s and %s, exceeds the limitation of %d.";

	for (auto& iter : singleRule->params)
	{
		if (iter.first == "BASES")
		{
			strBases = iter.second;
		}
		else if (iter.first == "RANKS")
		{
			strRanks = iter.second;
		}
		else if (iter.first == "FLEETS")
		{
			strFleets = iter.second;
		}
		else if (iter.first == "DESTINATION")
		{
			strParamDestination = iter.second;
		}
		else if (iter.first == "MAX CONSECUTIVE TIMES")
		{
			iParamMaxConTimes = boost::lexical_cast<int>(iter.second);
		}
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if ((*iter_roster)->duty == "FLY" && (*iter_roster)->pairing)
		{
			bMatchDestination = false;
			for (int iDutyIndex = 0; iDutyIndex < (*iter_roster)->pairing->getNumDuties(); iDutyIndex++)
			{
				Duty *duty = (*iter_roster)->pairing->getDuty(iDutyIndex);
				for (int iSegmentIndex = 0; iSegmentIndex < duty->getNumSegments(); iSegmentIndex++)
				{
					Segment *segment = duty->getSegment(iSegmentIndex);
					if (segment->getArrStation() == strParamDestination)
					{
						bMatchDestination = true;
						break;
					}
				}
				if (bMatchDestination)
				{
					break;
				}
			}

			if (bMatchDestination)
			{
				iOffset = this->dbData->getAirportOffset((*iter_roster)->getBase());
				// mantis#3426, 考慮跨日班的情形, 應該用下個勤務的起始時間和前一個勤務的結束日期來判斷
				if (iPrevTargetDutyEndDate == 0 ||
					(*iter_roster)->actStrUtc - iPrevTargetDutyEndDate >= 2 * TIME_DAY)
				{
					iTotalTimes = 1;
					iConDutyStartTime = static_cast<long>((*iter_roster)->actStrUtc);
					isAllPA = ((*iter_roster)->source == "PA");
				}
				else
				{
					iTotalTimes++;
					isAllPA &= ((*iter_roster)->source == "PA");
				}
				iCurrTargetDutyEndTime = static_cast<long>((*iter_roster)->actRestStrUtc);
				iPrevTargetDutyEndDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(iCurrTargetDutyEndTime, iOffset);
			}
			else
			{
				iTotalTimes = 0;
				isAllPA = false;
			}
		}
		else
		{
			iTotalTimes = 0;
			isAllPA = false;
		}

		// mantis#2748 - 預佔違反法規不該阻擋優化
		if (iTotalTimes > iParamMaxConTimes && !(this->application == ROSTER_OPTIMIZER && isAllPA))
		{
			util_timeT_to_dateStr(iConDutyStartTime, date_buf_from, sizeof(date_buf_from));
			util_timeT_to_dateStr(iCurrTargetDutyEndTime, date_buf_to, sizeof(date_buf_to));
			sprintf_s(msg, sizeof(msg), FMT_VIOLATION, iTotalTimes, strParamDestination.c_str(), date_buf_from, date_buf_to, iParamMaxConTimes);

			CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
			rv->isLegal = false;
			rv->startUtc = iConDutyStartTime;
			rv->endUtc = iCurrTargetDutyEndTime;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->legalMessage = msg;
			rv->operation_result.insert(make_pair("totalTimes", boost::lexical_cast<string>(iTotalTimes)));
			rv->operation_result.insert(make_pair("destination", strParamDestination));
			rv->operation_result.insert(make_pair("maxTimes", boost::lexical_cast<string>(iParamMaxConTimes)));

			rvs.push_back(rv);
			if (this->application == ROSTER_OPTIMIZER)
			{
				return rvs;
			}
		}
	}
	return rvs;
}

/* 
	JackJou 2017.11.18 
	[9013] 	Day off on Holiday 每月至少安排N 天DO於國定假日
*/
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkDOHoliday(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	vector<SharedPtr<CREW_BASE>> vCrewBase = crew->baseList;
	map<string, string> ruleParams = singleRule->params;
	string strBases, strRanks, strFleets, strDayAssignmentCode;
	bool bCountBlankDay;				// 計算空白天數 (目前是指國定假日)
	int iMinDOonHoliday;				// DO 參數
	vector<string>vDayAssignmentCode;	// Day Assignment Code 
	vector<string>::iterator iter_string;



	// 初始設定HolidayCount 以便於計算每個月份的Holiday 剩餘數量
	int HolidayCount[12];

	// 取得各國國定假日定義
	vector<SharedPtr<Holiday>> vHoliday = this->dbData->holidays;
	vector<SharedPtr<Holiday>>::iterator iter_holiday;

	Scenario strScenario = this->dbData->scenario;		// 腳本

	tm tmScenarioStartDt, tmScenarioEndDt;
	time_t  strScenarioStartDt = strScenario.startDtUTC;
	time_t  strScenarioEndDt = strScenario.endDtUTC;

	localtime_s(&tmScenarioStartDt, (const time_t*)&strScenarioStartDt);
	localtime_s(&tmScenarioEndDt, (const time_t*)&strScenarioEndDt);


	// Base , Rank , Assignment Group , Min DO on Hoilday , Count Blank Day 
	for (auto& iter_params : singleRule->params) //(iter_params = ruleParams.begin(); iter_params != ruleParams.end(); iter_params++)
	{
		if (iter_params.first == "BASES")
		{
			strBases = iter_params.second;
		}
		else if (iter_params.first == "RANKS")
		{
			strRanks = iter_params.second;
		}
		else if (iter_params.first == "FLEETS")
		{
			strFleets = iter_params.second;
		}
		else if (iter_params.first == "DO ASSIGNMENTS")	// 目前Default指的是 DO , 若之後還有衍伸需相同檢查方式, 可直接延伸套用 ( 修改參數名稱 2018.07.27 ) 
		{
			strDayAssignmentCode = iter_params.second;
			split(vDayAssignmentCode, strDayAssignmentCode, is_any_of("|"), token_compress_on);
		}
		else if (iter_params.first == "COUNT BLANK DAY")	// 需計算空白天  ( 修改參數名稱 2017.12.11 ) 
		{
			// 優化時一律把COUNT BLANK DAY設定成N, 避免移除任務時造成違反法規
			if (iter_params.second == "Y")
			{
				bCountBlankDay = true;
			}
			else
			{
				bCountBlankDay = false;
			}
		}
		else if (iter_params.first == "MIN DO ON HOLIDAY")		// 取得至少N天需於國定假日
		{
			iMinDOonHoliday = lexical_cast<int>(iter_params.second);
		}
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	// 檢查roster  		
	for (int i = 0; i < 12; i++)
	{
		HolidayCount[i] = -1;	// 初始設定為負值, 其原因為尚未確定是否有用到			
	}

	int iAssignmentGroupNotinHolidayCount = 0;
	// 取得該組員之國籍來比對所屬之假日
	for (iter_holiday = vHoliday.begin(); iter_holiday != vHoliday.end(); iter_holiday++)
	{
        string strCountry = (*iter_holiday)->country;
        if (strCountry == crew->nationality)
		{
			// 取得該國籍假日時間
			tm tmHolidayStartDt, tmHolidayEndDt;

            int iOffset = 0; 
            if (strCountry == "VN" || strCountry == "TH")
            {
                iOffset = 7;
            }
            else if (strCountry == "JP")
            {
                iOffset = 9;
            }
            else
            {
                iOffset = 8;
            }

            time_t strHolidayStartDt = (const __time32_t)(*iter_holiday)->strDt - iOffset*TIME_HOUR;
            time_t strHolidayEndDt = (const __time32_t)(*iter_holiday)->endDt - iOffset*TIME_HOUR ;

            

			localtime_s(&tmHolidayStartDt, (const time_t*)&strHolidayStartDt);
			localtime_s(&tmHolidayEndDt, (const time_t*)&strHolidayEndDt);

			// 由於Holiday Db 在設定Start End 若是當天只有設定當天的起始時間, 雖有設定EndDate 卻與StartDate 相同
			// 因此需要自行調整以免再時間範圍檢查的時候, 造成錯誤的判斷, 增加此段假若未來StartDate 與EndDate 確實設定之後
			// 則此判斷就無需進行時間調整

			if (strHolidayStartDt == strHolidayEndDt)
			{
				strHolidayEndDt += 86340; 	// 加上23:59:00 
			}

			// 增加檢查Holiday 是否在腳本時間內, 提升優化速度
			if ((strHolidayStartDt < strScenarioStartDt) || (strHolidayEndDt > strScenarioEndDt))	continue; 

			localtime_s(&tmHolidayEndDt, (const time_t*)&strHolidayEndDt);

			
			if (HolidayCount[tmHolidayStartDt.tm_mon] > 0)
				HolidayCount[tmHolidayStartDt.tm_mon] ++;
			else
				HolidayCount[tmHolidayStartDt.tm_mon] = 1;
			



			// 比對該Crew 之排定班表逐步檢查
			bool blIsBlankDay = true;  // 檢查該天Holiday 是否是BlankDay 
			for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
			{
				//tm tmCheckStartday, tmCheckEndday; 
				time_t strtmCheckStartDt;
				time_t strtmCheckEndDt;

				if ((*iter_roster)->pairingStartDt != 0 )
                    strtmCheckStartDt = (*iter_roster)->pairingStartDt;
				else if ((*iter_roster)->actStrUtc != 0)
                    strtmCheckStartDt = (*iter_roster)->actStrUtc;
				else if ((*iter_roster)->strUtc != 0)
                    strtmCheckStartDt = (*iter_roster)->strUtc; // Util::utcToLocal((*iter_roster)->strUtc);
                
				if ((*iter_roster)->actRestStrUtc != 0)
                    strtmCheckEndDt = (*iter_roster)->actRestStrUtc; //Util::utcToLocal((*iter_roster)->actRestStrUtc);//(const __time32_t)(*iter_roster)->actRestStrUtc;
				else if ((*iter_roster)->restStrUtc != 0)
                    strtmCheckEndDt = (*iter_roster)->restStrUtc; //Util::utcToLocal((*iter_roster)->restStrUtc);

                string strCheckStart = utcToUtcString(strtmCheckStartDt);
                string strCheckEnd = utcToUtcString(strtmCheckEndDt);

                string strHolidayStart = utcToUtcString(strHolidayStartDt);
                string strHolidayEnd = utcToUtcString(strHolidayEndDt);
				//localtime_s(&tmCheckStartday, (const time_t*)&(*iter_roster)->actStrUtc);
				//localtime_s(&tmCheckEndday, (const time_t*)&(*iter_roster)->actRestStrUtc);

				// 在這裡的都是範圍內, 表示該假日有DUTY 或 RB 等其他勤務
				string strDutyAUT = (*iter_roster)->duty;				// AUT_ASSIGNMENT_UNIT_TYPE from EVA_CR_AUT
				string strDutyLabel = (*iter_roster)->label;			// LABEL


				// 檢查該班表起訖時間是否在假日期間s  e +s----+e   s  e      e < +s  || s < +e    不在該範圍內都排除
				if ((strtmCheckEndDt< strHolidayStartDt) ||
					(strtmCheckStartDt > strHolidayEndDt))
				{
					/*  // 保留下來
					for (iter_string = vDayAssignmentCode.begin(); iter_string != vDayAssignmentCode.end(); iter_string++)
					{
					string strDutyCheck = *iter_string;
					if (strDutyAUT != strDutyCheck)
					{
					// 依照使用者需求面可能也要讓排班者知道有多少DO 不是坐落在國定假日上,是否需要警示在討論
					// 針對不在Holiday 範圍內的指定的Assigment Code 數量
					iAssignmentGroupNotinHolidayCount++;
					}
					}
					*/
					continue;

				}
				else
				{
					blIsBlankDay = false;		// 若是有Duty Assig 在當天, 無論什麼都不是空白天
					bool blCheckedFlag = false;
					for (iter_string = vDayAssignmentCode.begin(); iter_string != vDayAssignmentCode.end(); iter_string++)
					{
						string strDutyCheck = *iter_string;
						if (strDutyAUT != strDutyCheck)
						{
							HolidayCount[tmHolidayStartDt.tm_mon]--;
							blCheckedFlag = true;
							break;
						}
					}
					if (blCheckedFlag == true)	break;	// 檢查過了HolidayCount 以扣除,不得再入迴圈再扣
				}
			}
			// 若當天是空白天,Count Blank Day = N  , 則當天不列計
			if (blIsBlankDay == true && bCountBlankDay == false)
			{
				HolidayCount[tmHolidayStartDt.tm_mon]--;
			}
		}
	}

	

	// 檢查各月份是否有違反法規的情況
	for (int i = 0; i < 12; i++)
	{
		if (HolidayCount[i] == -1)	continue;		// 非在範圍內月份直接排除

		if (HolidayCount[i] < iMinDOonHoliday)		// 最後留下的Holiday 數量(內部包含空白天與指定的AssigmentGroup type ) 小於指定最小天數(空白天) 則需示警
		{
			tm tmCheckStartDt, tmCheckEndDt;

			// 取得月初 月底的時間

			tmCheckStartDt.tm_year = tmScenarioStartDt.tm_year;
			tmCheckStartDt.tm_mon = i;
			tmCheckStartDt.tm_mday = 1;
			tmCheckStartDt.tm_hour = 0;
			tmCheckStartDt.tm_min = 0;
			tmCheckStartDt.tm_sec = 0;

			tmCheckEndDt = tmCheckStartDt;
			tmCheckEndDt.tm_mon = i + 1;

			time_t strCheckStartDt = mktime(&tmCheckStartDt);
			time_t strCheckEndDt = mktime(&tmCheckEndDt);

			strCheckEndDt -= 24 * 60 * 60;   // 退回一天  ( 這段之後可以整合成Util 內的工具function , 常用) 

			// 若沒有包含在這個月份中, 那這個不能作為一整月的計算 
			if (strCheckStartDt >= strScenarioStartDt && strCheckEndDt <= strScenarioEndDt)
			{
				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
				rv->isLegal = false;
				rv->startUtc = static_cast<long>(strCheckStartDt);
				rv->endUtc = static_cast<long>(strCheckEndDt);
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				stringstream msg;
				msg << "Number of DO on holiday is less than " << iMinDOonHoliday;
				rv->legalMessage = msg.str();
				rv->operation_result.insert(make_pair("minHolidayDO", boost::lexical_cast<string>(iMinDOonHoliday)));

				rvs.push_back(rv);
			}
		}
	}
	return rvs;
}
/*
   JackJou 2017.11.31  No LH  PTN as first FLT after Promotion 
   9016, 剛升等之後第一班不要安排LH 班 ,為了滿足優化和新的要求, 修改為升等之後七天內不要安排LH 
*/
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkFirstFLTaftPromotion(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> &vCrewRoster = crew->rosterList;
	vector<SharedPtr<CREW_BASE>> vCrewBase = crew->baseList;
	vector<SharedPtr<CREW_RANK>> &vCrewRank = crew->rankList;
	map<string, string> ruleParams = singleRule->params;

	vector<string>vRuleAtr;
	vector<int>vRuleGapDay;

	string strRuleBase, strRuleRank, strRuleFleet, strRuleAtr;
	int iRuleGapDay = 0;

	// Bases , Ranks , Fleets , Assignment Group , Min DO on Hoilday , Count Blank Day 
	for (auto& iter_params : singleRule->params) //(iter_params = ruleParams.begin(); iter_params != ruleParams.end(); iter_params++)
	{
		if (iter_params.first == "BASES")
		{
			strRuleBase = iter_params.second;
		}
		else if (iter_params.first == "RANKS")
		{
			strRuleRank = iter_params.second;
		}
		else if (iter_params.first == "FLEETS")
		{
			strRuleFleet = iter_params.second;
		}
		else if (iter_params.first == "ATTRIBUTES")	// 職級分類或指定
		{
			strRuleAtr = iter_params.second;
			split(vRuleAtr, strRuleAtr, is_any_of("|"), token_compress_on);
		}
		else if (iter_params.first == "GAP BETWEEN PROMOTION DAYS")		// 取得至少N天需於國定假日
		{
			iRuleGapDay = lexical_cast<int>(iter_params.second);
			//vRuleGapDay.push_back(iRuleGapDay)
		}
		//Bases,Ranks,Attributes,Gap Between Promotion Days
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strRuleBase, strRuleRank, strRuleFleet, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	// 組員的Rank Promotion 
	// 取得該組員的RANK 資料  
	// rank_eff 有效起始日
	// rank_exp 到期日
	time_t tmCrewRankEff = 0, tmCrewRankExp = 0;
	string strCrewRank = "";
	bool bFound = true;

	strCrewRank = crew->rankList[0]->rank;			// 參數內的Rank
	tmCrewRankEff = crew->rankList[0]->effUtc;
	tmCrewRankExp = crew->rankList[0]->expUtc;

	// 檢查最新的Crew RANK 即可
	// IDCREW  RANK effUtc	             expUtc
	// XXXXXX 	AP	2017-10-01 00:00:00	 NULL
	// 最新的crew Rank expUt 是 null 
	if (tmCrewRankExp < tmCrewRankEff || -1 == tmCrewRankExp)
	{
		// 防止檢查的時候有問題因此將rank_exp 設一個未來值 
		tmCrewRankExp = tmCrewRankEff + 60 * 60 * 24 * 365 * 10;
	}
	vector<SharedPtr<ROSTER>>::iterator itRoster;
	//for (auto&itRoster : vCrewRoster)
	for (itRoster = vCrewRoster.begin(); itRoster != vCrewRoster.end(); itRoster++)
	{
		if ((*itRoster)->duty != "FLY")	continue;

		string actingRank = (*itRoster)->actingRank;
		long startDate = (*itRoster)->actStrUtc;
		long endDate = (*itRoster)->actEndUtc;

		if (actingRank != strCrewRank)		continue;

		if (tmCrewRankEff <= startDate && tmCrewRankExp >= endDate)
		{
			time_t tmOffset = startDate - tmCrewRankEff;
			if (tmOffset < 0)	continue;
			string strAttribute = (*itRoster)->pairing->getAttribute();
			if (strAttribute.length() <= 0)	continue;
			for (int i = 0; i < vRuleAtr.size(); i++)
			{
				string strFind = vRuleAtr[i];
				if (strAttribute.find(strFind, 0) != -1)
				{
					if ((tmOffset / (60 * 60 * 24)) <= iRuleGapDay)
					{
						CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
						rv->startUtc = (*itRoster)->actStrUtc;
                        rv->endUtc = (*itRoster)->actRestStrUtc;
						rv->isLegal = false;
						rv->rosterId = (*itRoster)->rosterId;
						rv->pairingId = (*itRoster)->pairId;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;

						char date_msg[30];
						util_timeT_to_dateStr((*itRoster)->actStrUtc, date_msg, sizeof(date_msg));
						string code = (*itRoster)->pairing->getFltCode();
						string legalmessage = string(date_msg) + " " + code + " has no enough gap between promotion day";
						rv->legalMessage = legalmessage;
						rv->operation_result.insert(make_pair("date", string(date_msg)));
						rv->operation_result.insert(make_pair("fltCode", (*itRoster)->pairing->getFltCode()));

						rvs.push_back(rv);
						if (this->application == ROSTER_OPTIMIZER)
							return rvs;

					}
				}
			}
		}
	}


	return rvs;
}

// 9015, Check Night Flight Rest
// 1. 連續2夜航至少休足34小時
// 2. 若未滿足1, 則連續3夜航至少休足54小時
// 3. 夜航休足14小時以上, 則不受前述兩項之限制
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkNightFltRst(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	vector<SharedPtr<ROSTER>>::iterator iter_latest_night_flight;
	vector<SharedPtr<DBRule_8014>> assignments = this->dbData->rule_8014;
	vector<string> restAssignments;
	int iNightFlightStartTime, iNightFlightEndTime;  // 夜航定義之起始結束時間
	int iConNightFlight = 0; // 連續夜航次數
	time_t iFirstNightFlightTime, iPrevDutyEndTime, iLocalDayStartTime, iCaughtFlightStandbyTime;
	long iDropOff, iPickUp;
	string strPrevDutyLabel;
	vector<string> vRestHourString;
	vector<int> vRestHour;
	bool isNightFlightDuty = false, isBreakRule = false, isExceedLimit = false;
	int iMinRestSeconds, iRestTime;
	int iOffset;
	const char* FMT_VIOLATION = "Rest time after night flight %s is %d:%02d, %d:%02d is required.";
	const char* FMT_VIOLATION_EXCEED_LIMIT = "%d consecutive night flights exceed the limitation.";
	char msg[128];

	for (auto& iter_params : singleRule->params)
	{
		if (iter_params.first == "NIGHT FLIGHT FROM(LOCAL)")
		{
			iNightFlightStartTime = ConvertHHMMtoSeconds(iter_params.second);
		}
		else if (iter_params.first == "NIGHT FLIGHT TO(LOCAL - START AIRPORT)")
		{
			iNightFlightEndTime = ConvertHHMMtoSeconds(iter_params.second);
		}
		else if (iter_params.first == "MIN REST HOURS")
		{
			boost::split(vRestHourString, iter_params.second, boost::is_any_of("|"), boost::token_compress_on);
			for (auto& iter = vRestHourString.begin(); iter != vRestHourString.end(); iter++) {
				vRestHour.push_back(boost::lexical_cast<int>((*iter)));
			}
		}
	}

	// Collect rest assignment definition
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == "REST" && (*assignment)->airline == this->dbData->scenario.airline)
		{
			restAssignments.push_back((*assignment)->assignemnt);
		}
	}

	iPrevDutyEndTime = this->dbData->startUtc;
	iPickUp = 0;
	iDropOff = 0;
	iCaughtFlightStandbyTime = 0;
	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if (find(restAssignments.begin(), restAssignments.end(), (*iter_roster)->duty) != restAssignments.end())
		{
			continue;
		}

		// RD不算勤務
		if ((*iter_roster)->qualifier == "RD")
		{
			continue;
		}

		// MVP來台不算夜航, MVP返回homebase就算休時不足也不違反法規, 因此本法規MVP不用考慮
		if ((*iter_roster)->duty == "MVP")
		{
			iConNightFlight = 0;
			continue;
		}

		iPickUp = 0;

		isNightFlightDuty = false;
		isBreakRule = false;
		isExceedLimit = false;
		if (((*iter_roster)->duty == "FLY" || (*iter_roster)->duty == "MVO") && (*iter_roster)->pairing)
		{
			for (int i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
			{
				Duty* duty = (*iter_roster)->pairing->getDuty(i);
				int iDutyStartTime = (iCaughtFlightStandbyTime > 0 && i == 0) ? iCaughtFlightStandbyTime : duty->getStartTimeUtcAct();
				iOffset = (duty->getStartTimeLocAct() - duty->getStartTimeUtcAct()) / TIME_HOUR;
				iLocalDayStartTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(static_cast<long>(iDutyStartTime), iOffset);
				isBreakRule = false;
				isExceedLimit = false;
				bool isFlightDuty = false;
				for (int j = 0; j < duty->getNumSegments(); j++)
				{
					Segment* segment = duty->getSegment(j);
					if (segment->getAssignment() == "OPR" || segment->getAssignment() == "PNC")
					{
						isFlightDuty = true;
						break;
					}
				}
				if (!isFlightDuty) // 如果不是飛航航段(例如高鐵赴任SUR)則略過
				{
					continue;
				}

				// 夜航判斷方式, 開始時間早於夜航定義結束時間 或
				// 結束時間(報到時間+FDP)大於隔天的夜航定義開始時間
				if (iDutyStartTime - iLocalDayStartTime <= iNightFlightEndTime ||
					iDutyStartTime + duty->getFDPInSecs() - iLocalDayStartTime >= iNightFlightStartTime + TIME_DAY)
				{
					isNightFlightDuty = (duty->getFDPInSecs() > 0); // 有FDP才算, 無OPR航段就不算夜航
				}
				else
				{
					isNightFlightDuty = false;
				}

				if (duty->getActualPickupMin() > 0) // 若航段非第一段, 取得hotel bus time
				{
					iPickUp = duty->getActualPickupMin() * TIME_MINUTE;
				}

				if (iConNightFlight > 0 && iConNightFlight <= vRestHour.size())
				{
					iMinRestSeconds = vRestHour[iConNightFlight - 1] * TIME_HOUR;
					iRestTime = iDutyStartTime - iPrevDutyEndTime - iDropOff - iPickUp;
					if (iRestTime >= iMinRestSeconds)
					{
						iConNightFlight = 0; // 休時足夠就可以斷開連續夜航
					}
				}

				if (isNightFlightDuty)
				{
					if (iConNightFlight < vRestHour.size())
					{
						// 尚未到達連續夜航上限, 交給下個duty判斷
						if (iConNightFlight == 0)
						{
							iFirstNightFlightTime = iCaughtFlightStandbyTime > 0 ? iCaughtFlightStandbyTime : (*iter_roster)->actStrUtc;
						}
						if (iter_roster + 1 != vRoster.end())
						{
							strPrevDutyLabel = (*iter_roster)->pairing->getLabel();
						}
					}
					else if (iConNightFlight == vRestHour.size())
					{
						// 連續三個夜航未休滿54小時需告警
						isBreakRule = true;
					}
					else
					{
						// 已超過連續夜航上限, 違反法規限制, 等到連續夜航結束才一次顯示
						isExceedLimit = true;
						if (iDutyStartTime - iPrevDutyEndTime - iDropOff - iPickUp > vRestHour[vRestHour.size() - 1] * TIME_HOUR)
						{
							isBreakRule = true; // 超過最大連續夜航次數且已中斷連續夜航, 需要出現警告
						}
					}
				}
				else
				{
					if (iConNightFlight > 1) {
						// 連續夜航休時不足, 如果只有一個夜航則不告警
						isBreakRule = true;
						if (iConNightFlight > vRestHour.size())
						{
							isExceedLimit = true;
						}
					}
				}
				iCaughtFlightStandbyTime = 0;

				if (isBreakRule)
				{
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();

					rv->isLegal = false;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					rv->startUtc = iFirstNightFlightTime;
					if (isExceedLimit)
					{
						rv->endUtc = iPrevDutyEndTime;
						sprintf_s(msg, sizeof(msg), FMT_VIOLATION_EXCEED_LIMIT, iConNightFlight);
					}
					else
					{
						rv->endUtc = (*iter_roster)->actRestStrUtc;
						sprintf_s(msg, sizeof(msg), FMT_VIOLATION,
							strPrevDutyLabel.c_str(),
							iRestTime / 3600, (iRestTime / 60) % 60,
							iMinRestSeconds / 3600, (iMinRestSeconds / 60) % 60
							);
					}
					rv->legalMessage = msg;
					rv->operation_result.insert(make_pair("rosterLabel", strPrevDutyLabel));
					rv->operation_result.insert(make_pair("rest_hhmm", boost::str(boost::format("%d:%02d") % (iRestTime / 3600) % ((iRestTime / 60) % 60))));
					rv->operation_result.insert(make_pair("minRest_hhmm", boost::str(boost::format("%d:%02d") % (iMinRestSeconds / 3600) % ((iMinRestSeconds / 60) % 60))));
					rv->msg_type = 1;

					rvs.push_back(rv);
					if (this->application == ROSTER_OPTIMIZER)
					{
						return rvs;
					}
				}

				if (iDutyStartTime - iPrevDutyEndTime - iDropOff - iPickUp > vRestHour[vRestHour.size() - 1] * TIME_HOUR)
				{
					// 和前一個勤務已經不連續
					iConNightFlight = 0;
				}

				if (duty->getActualDropoffMin() > 0)  // 若航段非最後一段, 取得hotel bus time, 並記錄iPrevDutyEndTime
				{
					iDropOff = duty->getActualDropoffMin() * TIME_MINUTE;
					iPrevDutyEndTime = duty->getEndTimeUtcAct();
				}

				if (isNightFlightDuty)
				{
					iConNightFlight++;
				}
				else
				{
					iConNightFlight = 0;
				}
			}
		}
		else
		{
			if ((*iter_roster)->duty == "RB")
			{
				if (iter_roster + 1 != vRoster.end())
				{
					if ((*(iter_roster + 1))->actStrUtc <= (*iter_roster)->actRestStrUtc) // 抓飛, 看下一個勤務
					{
						if ((*iter_roster)->qualifier.substr(1) == "CS") // Company standby才會從待命時間開始計算FDP
						{
							iCaughtFlightStandbyTime = (*iter_roster)->actStrUtc;
						}
						continue;
					}
				}
			}
			else if ((*iter_roster)->duty == "GND")
			{
				if (iter_roster + 1 != vRoster.end())
				{
					if ((*(iter_roster + 1))->actStrUtc <= (*iter_roster)->actRestStrUtc)
					{
						// 地面勤務和飛航勤務重疊或連續時, FDP開始時間和抓飛一樣由地面勤務報到時間開始計算
						iCaughtFlightStandbyTime = (*iter_roster)->actStrUtc;
						continue;
					}
				}
			}

			if (iConNightFlight > 1)
			{
				if (iConNightFlight > vRestHour.size())
				{
					isBreakRule = true;
					isExceedLimit = true;
				}
				else
				{
					// 連續夜航休時不足, 如果只有一個夜航則不告警
					iMinRestSeconds = vRestHour[iConNightFlight - 1] * TIME_HOUR;
					iRestTime = (*iter_roster)->actStrUtc - iPrevDutyEndTime - iDropOff - iPickUp; // 扣掉交通車時間
					if (iRestTime < iMinRestSeconds)
					{
						isBreakRule = true;
					}
				}
			}
			if (isBreakRule)
			{
				CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();

				rv->isLegal = false;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->startUtc = iFirstNightFlightTime;
				if (isExceedLimit)
				{
					rv->endUtc = iPrevDutyEndTime;
					sprintf_s(msg, sizeof(msg), FMT_VIOLATION_EXCEED_LIMIT, iConNightFlight);
					rv->operation_result.insert(make_pair("conNightFlight", boost::lexical_cast<string>(iConNightFlight)));
					rv->msg_type = 2;
				}
				else
				{
					rv->endUtc = (*iter_roster)->actRestStrUtc;
					sprintf_s(msg, sizeof(msg), FMT_VIOLATION,
						strPrevDutyLabel.c_str(),
						iRestTime / 3600, (iRestTime / 60) % 60,
						iMinRestSeconds / 3600, (iMinRestSeconds / 60) % 60
						);
					rv->operation_result.insert(make_pair("rosterLabel", strPrevDutyLabel));
					rv->operation_result.insert(make_pair("rest_hhmm", boost::str(boost::format("%d:%02d") % (iRestTime / 3600) % ((iRestTime / 60) % 60))));
					rv->operation_result.insert(make_pair("minRest_hhmm", boost::str(boost::format("%d:%02d") % (iMinRestSeconds / 3600) % ((iMinRestSeconds / 60) % 60))));
					rv->msg_type = 1;
				}

				rv->legalMessage = msg;
				rvs.push_back(rv);
				if (this->application == ROSTER_OPTIMIZER)
				{
					return rvs;
				}
			}
		}

		if (!isNightFlightDuty)
		{
			iConNightFlight = 0;
		}
		else
		{
			iter_latest_night_flight = iter_roster;
			if ((*iter_roster)->actStrUtc - iPrevDutyEndTime >= vRestHour[vRestHour.size() - 1] * TIME_HOUR)
			{
				// 夜航和上個勤務的間隔大於參數限制的最大時間就不算連續夜航, 此時應設定夜航次數為1
				iConNightFlight = 1;
			}
		}

		if (iter_roster + 1 != vRoster.end())
		{
			iPrevDutyEndTime = (*iter_roster)->actRestStrUtc;
			if ((*iter_roster)->pairing)
			{
				strPrevDutyLabel = (*iter_roster)->pairing->getLabel();
			}
			else
			{
				strPrevDutyLabel = (*iter_roster)->qualifier;
			}
		}
		
		// mantis#6735, 任務結束後的休息時間不須扣掉交通車時間
		//iDropOff = (*iter_roster)->communt * TIME_MINUTE;
		iDropOff = 0;
	}

	// 最後的連續夜航超過次數
	if (isNightFlightDuty && iConNightFlight > 1)
	{
		CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
		rv->isLegal = false;
		rv->startUtc = iFirstNightFlightTime;
		rv->endUtc = iPrevDutyEndTime;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;

		if (iConNightFlight > vRestHour.size())
		{
			sprintf_s(msg, sizeof(msg), FMT_VIOLATION_EXCEED_LIMIT, iConNightFlight);
			rv->operation_result.insert(make_pair("conNightFlight", boost::lexical_cast<string>(iConNightFlight)));
			rv->msg_type = 2;
		}
		else
		{
			sprintf_s(msg, sizeof(msg), FMT_VIOLATION,
				strPrevDutyLabel.c_str(),
				iRestTime / 3600, (iRestTime / 60) % 60,
				iMinRestSeconds / 3600, (iMinRestSeconds / 60) % 60
				);
			rv->operation_result.insert(make_pair("rosterLabel", strPrevDutyLabel));
			rv->operation_result.insert(make_pair("rest_hhmm", boost::str(boost::format("%d:%02d") % (iRestTime / 3600) % ((iRestTime / 60) % 60))));
			rv->operation_result.insert(make_pair("minRest_hhmm", boost::str(boost::format("%d:%02d") % (iMinRestSeconds / 3600) % ((iMinRestSeconds / 60) % 60))));
			rv->msg_type = 1;
		}

		rv->legalMessage = msg;
		rvs.push_back(rv);
	}

	return rvs;
}

// 9017, Consecutive FT/FDP limitation in 24 hours
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkCon24FtFdp(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	string strParamType, strParamRestLabels;
	string strParamExceptAirport;
	long iParamDomestic, iParamShortHaul, iParamLongHaul;
	long iParamRestPlusTime;
	time_t iCheckStart = 0, iCheckEnd = 0;
	time_t iSbyStart = 0, iSbyEnd = 0;
	TimeInfo singleFlightTime;
	vector<int> vTimeLimit;
	vector<TimeInfo> vFlightTime;
	vector<TimeInfo>::iterator iter1, iter2;
	vector<string> vRestLabel;
	vector<string> vExceptAirport;
	int iTimeIn24H, iFlightType;
	bool isPreAssigned;
	const char* FMT_VIOLATION = "%s ~ %s - consecutive %s is %d:%02d, exceed %d:%02d limitation.";
	char msg[128];
	char datetime_buf1[32], datetime_buf2[32];
	int iDD, iHH, iMM;

	for (auto &iter : singleRule->params)
	{
		if (iter.first == "TYPE")
		{
			strParamType = iter.second;
		}
		else if (iter.first == "SH(DOMESTIC)")
		{
			iParamDomestic = ConvertHHMMtoSeconds(iter.second);
		}
		else if (iter.first == "SH(INTERNATIONAL)")
		{
			iParamShortHaul = ConvertHHMMtoSeconds(iter.second);
		}
		else if (iter.first == "UH/LH/MH")
		{
			iParamLongHaul = ConvertHHMMtoSeconds(iter.second);
		}
		else if (iter.first == "SH REST LABELS") // 特定勤務為兩組人分別服勤P+O和O+P, 可視為有輪休
		{
			strParamRestLabels = iter.second;
			boost::split(vRestLabel, strParamRestLabels, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "PLUS TIME WITH REST")
		{
			iParamRestPlusTime = ConvertHHMMtoSeconds(iter.second);
		}
		else if (iter.first == "EXCEPT AIRPORTS")
		{
			strParamExceptAirport = iter.second;
			if (strParamExceptAirport != "*")
			{
				boost::split(vExceptAirport, strParamExceptAirport, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
	}

	iCheckStart = this->dbData->startUtc - TIME_DAY;
	iCheckEnd = this->dbData->endUtc + TIME_DAY;
	vFlightTime.clear();

	vTimeLimit.clear();
	vTimeLimit.push_back(iParamDomestic);
	vTimeLimit.push_back(iParamShortHaul);
	vTimeLimit.push_back(iParamShortHaul + iParamRestPlusTime);
	vTimeLimit.push_back(iParamLongHaul);

	for (auto& iter_roster : crew->rosterList)
	{
		if ((*iter_roster).actStrUtc < iCheckStart || (*iter_roster).actStrUtc > iCheckEnd)
			continue;

		// 紀錄公司待命的時間, 以便抓飛時FDP可以從待命開始時間計算, 家裡待命不算FDP
		if ((*iter_roster).duty == "RB" && (*iter_roster).qualifier.substr(1, 2) == "CS")
		{
			iSbyStart = (*iter_roster).actStrUtc;
			iSbyEnd = (*iter_roster).actRestStrUtc;
		}
		else if ((*iter_roster).duty == "FLY" || (*iter_roster).duty == "MVO")
		{
			if (!(*iter_roster).pairing)
				continue;

			isPreAssigned = ((*iter_roster).source == "PA");
			iFlightType = getFlightType((*iter_roster).pairing);

			// 如果Pairing Label符合定義的SH Rest Labels, 則視為有輪休
			if (iFlightType == FlightType_ShortHaul &&
				find(vRestLabel.begin(), vRestLabel.end(), (*iter_roster).label) != vRestLabel.end())
			{
				iFlightType = FlightType_ShortHaulWithRest;
			}

			for (int i = 0; i < (*iter_roster).pairing->getNumDuties(); i++)
			{
				Duty* duty = (*iter_roster).pairing->getDuty(i);

				if (find(vExceptAirport.begin(), vExceptAirport.end(), duty->getDepStation()) != vExceptAirport.end() ||
					find(vExceptAirport.begin(), vExceptAirport.end(), duty->getArrStation()) != vExceptAirport.end())
				{
					continue;
				}

				if (strParamType == "FDP") // FDP
				{
					singleFlightTime.timeStart = duty->getStartTimeUtcAct();
					singleFlightTime.iFlight = iFlightType;
					//20180607 ain, mantis#3436, _fdpInSecs 代替 _fdp[2]避免空异常
					//singleFlightTime.iDutyTime = (duty->getFDP()[0] * 60 + duty->getFDP()[1]) * 60;
					//singleFlightTime.iDutyTime = duty->getFDPInSecs();
					// mantis#6544, 從dutyValues取得正確的抓飛FDP
					singleFlightTime.iDutyTime = ((*iter_roster).dutyValues.getActFdp(i)) * 60;
					singleFlightTime.isPreAssigned = isPreAssigned;

					// 抓飛時FDP從公司待命的開始時間起計, 待命時間和飛航時間有重疊視為抓飛
					if (singleFlightTime.timeStart < iSbyEnd && singleFlightTime.timeStart > iSbyStart)
					{
						//singleFlightTime.iDutyTime += (singleFlightTime.timeStart - iSbyStart);
						singleFlightTime.timeStart = iSbyStart;
					}
					vFlightTime.push_back(singleFlightTime);
				}
				else if (strParamType == "FT") // FT
				{
					for (int j = 0; j < duty->getNumSegments(); j++)
					{
						Segment* segment = duty->getSegment(j);
						if (segment->getIsOperating())
						{
							singleFlightTime.timeStart = segment->getStartTimeUtcAct();
							singleFlightTime.iFlight = iFlightType;
							singleFlightTime.iDutyTime = segment->getEndTimeUtcAct() - singleFlightTime.timeStart;
							//singleFlightTime.iDutyTime = segment->getBlkTime();
							singleFlightTime.isPreAssigned = isPreAssigned;
							vFlightTime.push_back(singleFlightTime);
						}
					}
				}
			}
		}
	}

	for (iter1 = vFlightTime.begin(); iter1 != vFlightTime.end(); iter1++)
	{
		iCheckStart = (*iter1).timeStart;
		iCheckEnd = iCheckStart + TIME_DAY;
		iTimeIn24H = (*iter1).iDutyTime;
		iFlightType = (*iter1).iFlight;
		isPreAssigned = (*iter1).isPreAssigned;

		iter2 = iter1;
		while (++iter2 != vFlightTime.end())
		{
			if ((*iter2).timeStart < (*iter1).timeStart + (*iter1).iDutyTime)
			{
				continue;
			}
			if ((*iter2).timeStart > iCheckEnd)
			{
				break;
			}
			else if ((*iter2).timeStart + (*iter2).iDutyTime > iCheckEnd)
			{
				iTimeIn24H += (iCheckEnd - (*iter2).timeStart);
			}
			else
			{
				iTimeIn24H += (*iter2).iDutyTime;
			}
			// 時間段內所有勤務都是預佔才算預佔
			isPreAssigned &= (*iter2).isPreAssigned;
		}

		if (iTimeIn24H > vTimeLimit[iFlightType] && !(this->application == ROSTER_OPTIMIZER && isPreAssigned))
		{
			CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
			int iTimeLimit = vTimeLimit[iFlightType];
			rv->isLegal = false;
			rv->startUtc = iCheckStart;
			rv->endUtc = iCheckEnd;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			util_timeT_to_dateStr_DDHHMM(iCheckStart, datetime_buf1, sizeof(datetime_buf1), &iDD, &iHH, &iMM);
			util_timeT_to_dateStr_DDHHMM(iCheckEnd, datetime_buf2, sizeof(datetime_buf2), &iDD, &iHH, &iMM);
			sprintf_s(msg, sizeof(msg), FMT_VIOLATION,
				datetime_buf1, datetime_buf2, strParamType.c_str(),
				iTimeIn24H / 3600, (iTimeIn24H / 60) % 60,
				iTimeLimit / 3600, (iTimeLimit / 60) % 60);
			rv->legalMessage = msg;
			rv->operation_result.insert(make_pair("start_ddhhmm", string(datetime_buf1)));
			rv->operation_result.insert(make_pair("end_ddhhmm", string(datetime_buf2)));
			rv->operation_result.insert(make_pair("type", strParamType));
			rv->operation_result.insert(make_pair("timeIn24h_hhmm", boost::str(boost::format("%d:%02d") % (iTimeIn24H / 3600) % ((iTimeIn24H / 60) % 60))));
			rv->operation_result.insert(make_pair("timeLimit_hhmm", boost::str(boost::format("%d:%02d") % (iTimeLimit / 3600) % ((iTimeLimit / 60) % 60))));

			rvs.push_back(rv);
			if (this->application == ROSTER_OPTIMIZER)
			{
				return rvs;
			}
		}
	}

	return rvs;
}

// 9018, ACRC: Crew Recency
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkCrewFleetRecency(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	string strBases, strRanks, strFleets, strActingRanks, strIncludeRoles;
	string strQuals, strRecencyFleets, strOperate, strDutyQualifier, strUnit;
	int iQualDays, iMaxGapPeriod;
	vector<string> vActingRank, vIncludeRole, vQual;
	vector<string> vRecencyFleet, vExpiringFleet;
	bool isQualifiedCrew;
	bool isFleetExisting, isFleetExpiring;
	bool isValidDuty, isRoAssigned;
	map<string, string>::iterator it_mapExpiringFleet;
	char msg[128];
	char date_buf_from[30], date_buf_to[30];
	const char *FMT_VIOLATION_NOT_EXISTED = "Fleet recency of %s does not exist in %d %s.";
	const char *FMT_VIOLATION_PREVIOUS_NOT_FOUND = "The previous recency of %s before %s(%s) does not exist.";
	const char *FMT_VIOLATION_GAP_TOO_LONG = "The gap days of %s between %s and %s(%s) is more than %d %s.";
	const char *FMT_VIOLATION_PREVIOUS_TOO_LONG = "The previous recency of %s is %s, over %d %s.";

	// 如果組員沒有五個月以上沒飛過的機型, 就不用檢查
	if (mapCrewExpiringFleet.count(crew->idCrew) == 0)
	{
		return rvs;
	}

	for (auto &iter : singleRule->params)
	{
		if (iter.first == "BASES") {
			strBases = iter.second;
		}
		else if (iter.first == "RANKS") {
			strRanks = iter.second;
		}
		else if (iter.first == "FLEETS") {
			strFleets = iter.second;
		}
		else if (iter.first == "ACTING RANKS") {
			strActingRanks = iter.second;
		}
		else if (iter.first == "INCLUDE ROLES(OVER)")
		{
			strIncludeRoles = iter.second;
		}
		else if (iter.first == "QUALS") {
			strQuals = iter.second;
		}
		else if (iter.first == "QUAL DAYS") {
			iQualDays = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "RECENCY FLEETS") {
			strRecencyFleets = iter.second;
		}
		else if (iter.first == "OPERATE") {
			strOperate = iter.second;
		}
		else if (iter.first == "MAX GAP PERIOD") {
			iMaxGapPeriod = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "PERIOD UNIT")
		{
			strUnit = iter.second;
		}
		else if (iter.first == "QUALIFIER FOR RO") {
			strDutyQualifier = iter.second;
		}
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, "*", this->dbData->startUtc, this->dbData->endUtc + TIME_DAY))
	{
		return rvs;
	}

	// 檢查組員是否已在職60天以上, 剛復職的組員不檢查
	isQualifiedCrew = false;
	for (auto& itBase : crew->baseList)
	{
		if (itBase->effUtc <= this->dbData->scenario.startDtUTC - iQualDays * TIME_DAY &&
			itBase->expUtc >= this->dbData->scenario.endDtUTC)
		{
			isQualifiedCrew = true;
		}
	}
	if (!isQualifiedCrew)
	{
		return rvs;
	}

	if (strActingRanks != "*")
	{
		boost::split(vActingRank, strActingRanks, boost::is_any_of("|"), boost::token_compress_on);
	}
	if (strIncludeRoles != "*")
	{
		boost::split(vIncludeRole, strIncludeRoles, boost::is_any_of("|"), boost::token_compress_on);
	}
	boost::split(vRecencyFleet, strRecencyFleets, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(vQual, strQuals, boost::is_any_of("|"), boost::token_compress_on);

	isFleetExpiring = false;
	vExpiringFleet.clear();
	for (it_mapExpiringFleet = mapCrewExpiringFleet.lower_bound(crew->idCrew); it_mapExpiringFleet != mapCrewExpiringFleet.end(); it_mapExpiringFleet++)
	{
		if ((*it_mapExpiringFleet).first != crew->idCrew)
		{
			break;
		}

		if ((*it_mapExpiringFleet).second == strRecencyFleets)
		{
			isFleetExpiring = true;
		}
		vExpiringFleet.push_back((*it_mapExpiringFleet).second);
	}

	if (isFleetExpiring)
	{
		if (this->application == ROSTER_OPTIMIZER)
		{
			// 檢查目標機型是否快過期, 並且重新計算當月份是否有值勤快過期的機型
			isFleetExisting = false;
			for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
			{
				if ((*iter_roster)->pairing && (*iter_roster)->duty == "FLY" || (*iter_roster)->duty == "MVO")
				{
					if (strActingRanks == "*" || find(vActingRank.begin(), vActingRank.end(), (*iter_roster)->actingRank) != vActingRank.end() ||
						((*iter_roster)->actingRank == "OVER" && (strIncludeRoles == "*" ||
							find(vIncludeRole.begin(), vIncludeRole.end(), (*iter_roster)->role) != vIncludeRole.end())))
					{
						for (int i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
						{
							Duty* duty = (*iter_roster)->pairing->getDuty(i);
							for (int j = 0; j < duty->getNumSegments(); j++)
							{
								Segment* segment = duty->getSegment(j);
								if (this->application != ROSTER_OPTIMIZER &&
									find(vRecencyFleet.begin(), vRecencyFleet.end(), segment->getFleetCD()) != vRecencyFleet.end() &&
									segment->getAssignment() == strOperate)
								{
									isFleetExisting = true;
								}

								// 檢查原有勤務是否有包含很久沒飛的機型
								if (!(*iter_roster)->needRuleCheck)
								{
									for (vector<string>::iterator it_fleet = vExpiringFleet.begin(); it_fleet != vExpiringFleet.end(); it_fleet++)
									{
										vector<string> vExpiringAcType;
										boost::split(vExpiringAcType, (*it_fleet), boost::is_any_of("|"), boost::token_compress_on);
										if (find(vExpiringAcType.begin(), vExpiringAcType.end(), segment->getFleetCD()) != vExpiringAcType.end() &&
											segment->getAssignment() == strOperate)
										{
											vExpiringFleet.erase(it_fleet);
											break;
										}
									}
								}
							}
						}
					}
				}
			}

			if (vExpiringFleet.size() > 0) // 優化時該組員有快過期的機型
			{
				isValidDuty = true;
				isRoAssigned = false;
				for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
				{
					if ((*iter_roster)->needRuleCheck)
					{
						isRoAssigned = true;

						// 只檢查剛優化上的FLY勤務, moving不限制
						if ((*iter_roster)->duty != "FLY")
						{
							continue;
						}
						if (strDutyQualifier != "*" && (*iter_roster)->qualifier != strDutyQualifier)
						{
							continue;
						}

						isValidDuty = false;
						// 確保優化上去的勤務是屬於很久沒飛的機型
						for (int i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
						{
							Duty* duty = (*iter_roster)->pairing->getDuty(i);
							for (int j = 0; j < duty->getNumSegments(); j++)
							{
								Segment* segment = duty->getSegment(j);

								for (auto& itFleet : vExpiringFleet)
								{
									vector<string> vExpiringAcType;
									boost::split(vExpiringAcType, itFleet, boost::is_any_of("|"), boost::token_compress_on);
									if (find(vExpiringAcType.begin(), vExpiringAcType.end(), segment->getFleetCD()) != vExpiringAcType.end() &&
										segment->getAssignment() == strOperate)
									{
										// 有安排一個很久沒飛的機型就可以
										return rvs;
									}
								}
							}
						}
					}
				}

				// 如果有快過期的機型且完全沒有優化上去, 可能是該機型將被swap給其他組員, 需報錯阻止
				if (!isValidDuty || !isRoAssigned)
				{
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = this->dbData->scenario.startDtUTC;
					rv->endUtc = this->dbData->scenario.endDtUTC;
					rv->legalMessage = "The expiring fleets are not arranged.";
					rvs.push_back(rv);
					return rvs;
				}
			}
		}
		else
		{
			RecencyMapWithHashAndEqual recencyOfCrew;

			time_t iLastRecencyDate = 0; // 載入區間之前最後一次飛過該機型的日期
			time_t iFirstAssignedDate = 0; // 載入區間之後第一個安排該機型的日期
			string strFirstAssignedLabel; // 載入區間之後第一個安排該機型的Pairing Label
			int iFirstAssignedIndex; // 載入區間之後第一個安排該機型的roster index
			time_t iCheckStartUtc = 0; // 前六個月的時間點, 此時間之後若有recency就不違反法規
			time_t iCurrentMonthStartUtc = 0; // 當Period Unit = CM, 目前勤務的當月1日開始時間

			if (strUnit == "CD")
			{
				iCheckStartUtc = this->dbData->startUtc - iMaxGapPeriod*TIME_DAY;
			}
			else if (strUnit == "CM")
			{
				// 先取得載入區間完整月份的開始時間
				iCurrentMonthStartUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(static_cast<long>(this->dbData->startUtc) + TIME_DAY, TPE_OFFSET);
				iCheckStartUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(static_cast<long>(iCurrentMonthStartUtc - iMaxGapPeriod*TIME_DAY*28), TPE_OFFSET);
			}
			else
			{
				printf("Error: Rule 9018 - Unsupported Period Unit!\n");
				return rvs;
			}

			auto& it = this->dbData->recencyMgr.getRecencyMap().find(crew->idCrew);
			if (it != this->dbData->recencyMgr.getRecencyMap().end())
			{
				recencyOfCrew = it->second;
			}

			for (auto& recencyClass : recencyOfCrew)
			{
				const SharedPtr<CrewRecency>& key = recencyClass.first;
				if (find(vRecencyFleet.begin(), vRecencyFleet.end(), key->fleet) != vRecencyFleet.end() &&
					key->operate == strOperate)
				{
					for (auto& recency : recencyClass.second)
					{
						if (recency->crewDateUtc < this->dbData->startUtc)
						{
							if (strActingRanks == "*" || find(vActingRank.begin(), vActingRank.end(), recency->actingRank) != vActingRank.end() ||
								(recency->actingRank == "OVER" && (strIncludeRoles == "*" ||
								find(vIncludeRole.begin(), vIncludeRole.end(), recency->role) != vIncludeRole.end())))
							{
								iLastRecencyDate = max(iLastRecencyDate, recency->crewDateUtc);
							}
						}
					}
				}
			}

			for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
			{
				if ((*iter_roster)->pairing && ((*iter_roster)->duty == "FLY" || (*iter_roster)->duty == "MVO") &&
					(strActingRanks == "*" || find(vActingRank.begin(), vActingRank.end(), (*iter_roster)->actingRank) != vActingRank.end() ||
					((*iter_roster)->actingRank == "OVER" && (strIncludeRoles == "*" ||
						find(vIncludeRole.begin(), vIncludeRole.end(), (*iter_roster)->role) != vIncludeRole.end()))))
				{
					for (int i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
					{
						Duty* duty = (*iter_roster)->pairing->getDuty(i);
						for (int j = 0; j < duty->getNumSegments(); j++)
						{
							Segment* segment = duty->getSegment(j);
							if (find(vRecencyFleet.begin(), vRecencyFleet.end(), segment->getFleetCD()) != vRecencyFleet.end() &&
								segment->getAssignment() == strOperate)
							{
								if (segment->getEndTimeUtcAct() < this->dbData->startUtc)
								{
									iLastRecencyDate = max(iLastRecencyDate, segment->getEndTimeUtcAct());
								}
								else
								{
									if (iFirstAssignedDate == 0)
									{
										iFirstAssignedDate = segment->getStartTimeUtcAct();
										strFirstAssignedLabel = (*iter_roster)->label;
										iFirstAssignedIndex = std::distance(vRoster.begin(), iter_roster);
									}
									else
									{
										iFirstAssignedDate = min(iFirstAssignedDate, segment->getStartTimeUtcAct());
									}
								}
							}
						}
					}
				}
			}

			if (iFirstAssignedDate == 0)
			{
				if (iLastRecencyDate < iCheckStartUtc)
				{
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = this->dbData->scenario.startDtUTC;
					rv->endUtc = this->dbData->scenario.endDtUTC;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					if (iLastRecencyDate > 0)
					{
						util_timeT_to_dateStr(iLastRecencyDate, date_buf_from, sizeof(date_buf_from));
						sprintf_s(msg, sizeof(msg), FMT_VIOLATION_PREVIOUS_TOO_LONG,
							strRecencyFleets.c_str(), date_buf_from, iMaxGapPeriod, strUnit.c_str());
						rv->operation_result.insert(make_pair("recencyFleets", strRecencyFleets));
						rv->operation_result.insert(make_pair("date", string(date_buf_from)));
						rv->operation_result.insert(make_pair("period", boost::lexical_cast<string>(iMaxGapPeriod)));
						rv->operation_result.insert(make_pair("unit", strUnit));
						rv->msg_type = 4;
					}
					else
					{
						sprintf_s(msg, sizeof(msg), FMT_VIOLATION_NOT_EXISTED,
							strRecencyFleets.c_str(), iMaxGapPeriod, strUnit.c_str());
						rv->operation_result.insert(make_pair("recencyFleets", strRecencyFleets));
						rv->operation_result.insert(make_pair("period", boost::lexical_cast<string>(iMaxGapPeriod)));
						rv->operation_result.insert(make_pair("unit", strUnit));
						rv->msg_type = 1;
					}
					rv->legalMessage = msg;

					rvs.push_back(rv);
				}
			}
			else
			{
				if (strUnit == "CD")
				{
					iCheckStartUtc = iFirstAssignedDate - iMaxGapPeriod*TIME_DAY;
				}
				else if (strUnit == "CM")
				{
					iCurrentMonthStartUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(static_cast<long>(iFirstAssignedDate), TPE_OFFSET);
					iCheckStartUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(static_cast<long>(iCurrentMonthStartUtc - iMaxGapPeriod*TIME_DAY * 28), TPE_OFFSET);
				}

				if (iLastRecencyDate < iCheckStartUtc)
				{
					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					rv->isLegal = false;
					rv->startUtc = (vRoster[iFirstAssignedIndex])->actStrUtc;
					rv->endUtc = (vRoster[iFirstAssignedIndex])->actRestStrUtc;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					util_timeT_to_dateStr(iFirstAssignedDate, date_buf_to, sizeof(date_buf_to));
					if (iLastRecencyDate > 0)
					{
						util_timeT_to_dateStr(iLastRecencyDate, date_buf_from, sizeof(date_buf_from));
						sprintf_s(msg, sizeof(msg), FMT_VIOLATION_GAP_TOO_LONG,
							strRecencyFleets.c_str(), date_buf_from, date_buf_to, 
							strFirstAssignedLabel.c_str(), iMaxGapPeriod, strUnit.c_str());
						rv->operation_result.insert(make_pair("recencyFleets", strRecencyFleets));
						rv->operation_result.insert(make_pair("fromDate", string(date_buf_from)));
						rv->operation_result.insert(make_pair("toDate", string(date_buf_to)));
						rv->operation_result.insert(make_pair("rosterLabel", strFirstAssignedLabel));
						rv->operation_result.insert(make_pair("period", boost::lexical_cast<string>(iMaxGapPeriod)));
						rv->operation_result.insert(make_pair("unit", strUnit));
						rv->msg_type = 3;
					}
					else
					{
						sprintf_s(msg, sizeof(msg), FMT_VIOLATION_PREVIOUS_NOT_FOUND,
							strRecencyFleets.c_str(), date_buf_to, strFirstAssignedLabel.c_str());
						rv->operation_result.insert(make_pair("recencyFleets", strRecencyFleets));
						rv->operation_result.insert(make_pair("date", string(date_buf_to)));
						rv->operation_result.insert(make_pair("label", strFirstAssignedLabel));
						rv->msg_type = 2;
					}
					rv->legalMessage = msg;
					rvs.push_back(rv);
				}
			}
		}
	}

	return rvs;
}

// 9019, NoOCAEQCA: CAE and QCA requirements on a flight
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkNumberOfCAEQCA(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	string strParamQualifiers, strParamCountries, strParamMinFrnCrew;
	string strParamFlightNumbers = "*"; // 相容舊的法規參數, 當沒有FLIGHT NUMBERS欄位時default為*
	string strDepCountry, strArrCountry, strSpecificCrewNationality;
	vector<string> vACType, vQualifier, vCountry, vFlightNumber;
	time_t iSegmentStart, iSegmentEnd;
	int iRequiredCAE, iRequiredTWCAE, iRequiredTWQCA, iQCAQualifyDays;
	int iRequiredSpecificFrnCrew = 0;
	int iNoofCAE, iNoofTWCAE, iNoofTWQCA;
	int iNoofTWCAEQCA; // 身兼TWCAE和TWQCA的人數, 只能擇一擔任
	int iNoofSpecificFrnCrew; // 指定國籍的組員數量
	int iStandardAPComp, iFlightAPComp;
	vector<long long>fltPairingList;
	string strSegmentQualifier;
	int iTotalComp;      // 所有CA職級配置
	int iTotalCompTW;    // 所有本籍組員能安排的CA配置 (起訖地必須在台灣)
	int iUnassignComp;   // 所有尚未安排的CA complement
	int iUnassignCompTW; // 能安排本籍組員但尚未安排的CA complement
	char date_buf[30];

	for (auto& iter : singleRule->params)
	{
		if (iter.first == "AC TYPES") {
			boost::split(vACType, iter.second, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "QUALIFIERS") {
			strParamQualifiers = iter.second;
			boost::split(vQualifier, strParamQualifiers, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "COUNTRIES") {
			strParamCountries = iter.second;
			boost::split(vCountry, strParamCountries, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "FLIGHT NUMBERS")
		{
			strParamFlightNumbers = iter.second;
			if (strParamFlightNumbers != "*")
			{
				boost::split(vFlightNumber, strParamFlightNumbers, boost::is_any_of("|"), boost::token_compress_on);
			}
		}
		else if (iter.first == "MIN TW CAE")
		{
			iRequiredTWCAE = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "MIN CAE(TW + EXPAT)")
		{
			iRequiredCAE = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "MIN TW QCA")
		{
			iRequiredTWQCA = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "QCA QUALIFY DAYS")
		{
			iQCAQualifyDays = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "AP STD COMP")
		{
			iStandardAPComp = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "MIN FRN CREW")
		{
			strParamMinFrnCrew = iter.second;
			int iSeparatorIndex = strParamMinFrnCrew.find(':');
			if (iSeparatorIndex > 0)
			{
				strSpecificCrewNationality = strParamMinFrnCrew.substr(0, iSeparatorIndex);
				iRequiredSpecificFrnCrew = boost::lexical_cast<int>(strParamMinFrnCrew.substr(iSeparatorIndex + 1, string::npos));
			}
		}
	}

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->dbData->crewOnFlt;

	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if (this->application == ROSTER_OPTIMIZER && !(*iter_roster)->needRuleCheck) {
			continue;
		}

		if ((*iter_roster)->actingRank != "CA") {
			continue;
		}
		if (!(*iter_roster)->pairing) {
			continue;
		}
		if ((*iter_roster)->actRestStrUtc < this->dbData->startUtc) {
			continue;
		}

		for (int i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
		{
			Duty* duty = (*iter_roster)->pairing->getDuty(i);
			for (int j = 0; j < duty->getNumSegments(); j++)
			{
				Segment* segment = duty->getSegment(j);
				if (find(vACType.begin(), vACType.end(), segment->getFleetCD()) == vACType.end()) {
					continue;
				}

				if (strParamCountries != "*")
				{
					// 檢查航段是否符合法規參數欄位Countries的定義
					strDepCountry = this->dbData->findAirportCountry(segment->getDepStation());
					strArrCountry = this->dbData->findAirportCountry(segment->getArrStation());
					if (find(vCountry.begin(), vCountry.end(), strDepCountry) == vCountry.end() &&
						find(vCountry.begin(), vCountry.end(), strArrCountry) == vCountry.end())
					{
						continue;
					}
				}

				if (strParamFlightNumbers != "*")
				{
					// 檢查航段是否符合法規參數欄位Flight Numbers定義的航班編號
					if (find(vFlightNumber.begin(), vFlightNumber.end(), segment->getFlightNumber()) == vFlightNumber.end())
					{
						continue;
					}
				}

				if (!segment->getIsOperating())
				{
					continue;
				}

				if ((segment->getDepStation() == "TPE" && segment->getArrStation() == "BKK") ||
					(segment->getDepStation() == "BKK" && segment->getArrStation() == "TPE"))
				{
					strSegmentQualifier = "SH";  // 歐洲四腿班的TPE-BKK航段一律視為SH
				}
				else
				{
					strSegmentQualifier = (*iter_roster)->pairing->getQualifier();
					// Moving Pattern一律視為SH
					if (strSegmentQualifier == "MVO")
					{
						strSegmentQualifier = "SH";
					}
				}

				if (strParamQualifiers != "*" && find(vQualifier.begin(), vQualifier.end(), strSegmentQualifier) == vQualifier.end()) {
					continue;
				}

				iSegmentStart = segment->getStartTimeUtcAct();
				iSegmentEnd = segment->getEndTimeUtcAct();

				// 統計此航段flight所有的CA和AP complement數量
				fltPairingList = this->dbData->fltToPairingMap[segment->getDBId()];
				iTotalComp = 0;
				iTotalCompTW = 0;
				iFlightAPComp = 0;
				for (auto& iter_pairing : fltPairingList)
				{
					long long pairingId = iter_pairing;
					Pairing* flt_pairing = this->dbData->pairingIdMap[pairingId];
					map<string, int>& complementMap = flt_pairing->getComplements();
					bool isTargetPairing = false;
					bool isOPR = false;
					int iComplementCA = 0;

					for (int i = 0; i < flt_pairing->getNumDuties(); i++)
					{
						Duty* flt_duty = flt_pairing->getDuty(i);
						for (int j = 0; j < flt_duty->getNumSegments(); j++)
						{
							Segment* flt_segment = flt_duty->getSegment(j);
							if (flt_segment->getDBId() == segment->getDBId() && flt_segment->getAssignment() == "OPR")
							{
								isOPR = true;
							}
						}
					}

					if (isOPR)
					{
						if (complementMap.find("CA") != complementMap.end() && complementMap["CA"] > 0)
						{
							iComplementCA = complementMap["CA"];
							iTotalComp += iComplementCA;
							if (flt_pairing->getBase() == "")
							{
								printf("ERROR: flt_pairing->getBase() is empty! pairing_id=%d\n", flt_pairing->getDbId());
							}
							if (flt_pairing->getEndArp() == "")
							{
								printf("ERROR: flt_pairing->getEndArp() is empty! pairing_id=%d\n", flt_pairing->getDbId());
							}
							if (this->dbData->findAirportCountry(flt_pairing->getBase()) == "TW" &&
								this->dbData->findAirportCountry(flt_pairing->getEndArp()) == "TW")
							{
								// 出發和抵達都在TWN才可安排本籍組員
								iTotalCompTW += iComplementCA;
							}
						}
						if (complementMap.find("AP") != complementMap.end() && complementMap["AP"] > 0)
						{
							iFlightAPComp += complementMap["AP"];
						}
					}
				}

				iUnassignComp = iTotalComp;
				iUnassignCompTW = iTotalCompTW;
				if (iFlightAPComp > iStandardAPComp)
				{
					iNoofCAE = iNoofTWCAE = iNoofTWQCA = iNoofTWCAEQCA = iFlightAPComp - iStandardAPComp;
				}
				else
				{
					iNoofCAE = iNoofTWCAE = iNoofTWQCA = iNoofTWCAEQCA = 0;
				}
				iNoofSpecificFrnCrew = 0;
				if (crewsOnFlt.find(segment->getDBId()) != crewsOnFlt.end())
				{
					vector<SharedPtr<CrewOnFlight>>& cofOfCrew = crewsOnFlt.find(segment->getDBId())->second;
					for (auto& cof : cofOfCrew) {
						if (cof->actingRank == "CA" && cof->assignment == "OPR")
						{
							Pairing *cofPairing = this->dbData->pairingIdMap[cof->pairingId];
							if (cofPairing == NULL)
							{
								continue;
							}
							if (iUnassignComp > 0)
							{
								iUnassignComp--;
							}
							if (cofPairing->getBase() == "")
							{
								printf("ERROR: cofPairing->getBase() is empty! pairing_id=%d\n", cofPairing->getDbId());
							}
							if (cofPairing->getEndArp() == "")
							{
								printf("ERROR: cofPairing->getEndArp() is empty! pairing_id=%d\n", cofPairing->getDbId());
							}
							if (this->dbData->findAirportCountry(cofPairing->getBase()) == "TW" &&
								this->dbData->findAirportCountry(cofPairing->getEndArp()) == "TW")
							{
								if (iUnassignCompTW > 0)
								{
									iUnassignCompTW--;
								}
							}
							bool isCAE = false;
							bool isQCA = false;
							int iCAQualifiyDayTime = 0;
							for (auto& iter_rank : cof->crew->rankList)
							{
								if (iter_rank->effUtc <= iSegmentStart)
								{
									if ((iter_rank->expUtc < 0 || iter_rank->expUtc > iSegmentEnd))
									{
										if (iter_rank->rank == "AP" || iter_rank->rank == "DP" || iter_rank->rank == "CP")
										{
											isCAE = true;
											isQCA = true;
										}
										else if (iter_rank->rank == "CA")
										{
											iCAQualifiyDayTime += iSegmentStart - iter_rank->effUtc;
										}
									}
									else if (iter_rank->rank != "TA" && iter_rank->rank != "TR")
									{
										iCAQualifiyDayTime += iter_rank->expUtc - iter_rank->effUtc;
									}
								}
							}
							if (iCAQualifiyDayTime >= iQCAQualifyDays*TIME_DAY)
							{
								isQCA = true;
							}
							for (auto& iter_qual : cof->crew->qualificationList)
							{
								if (iter_qual->qual == "CAE" && iter_qual->issuedUtc <= iSegmentStart &&
									(iter_qual->expiryUtc < 0 || iter_qual->expiryUtc >= iSegmentEnd))
								{
									isCAE = true;
									break;
								}
							}

							if (cof->crew->nationality == "TW")
							{
								if (isCAE)
								{
									iNoofCAE++;
									iNoofTWCAE++;
								}
								if (isQCA)
								{
									iNoofTWQCA++;
								}
								if (isCAE && isQCA)
								{
									iNoofTWCAEQCA++;
								}
							}
							else if (isCAE) // 外籍組員只會是CAE不會是QCA
							{
								iNoofCAE++;
							}
						}
						if (cof->assignment == "OPR")
						{
							if (iRequiredSpecificFrnCrew > 0 && strSpecificCrewNationality == cof->crew->nationality)
							{
								iNoofSpecificFrnCrew++;
							}
						}
					}

					// 將身兼TWCAE和TWQCA的組員分配任務角色
					if (iNoofTWCAEQCA > 0 && iRequiredCAE > 0 && iRequiredTWQCA > 0)
					{
						// 首先將QCA不足的員額補滿, 全部可當QCA的人數扣掉可當CAE或QCA的人數就是只能當QCA的人數
						if (iNoofTWQCA - iNoofTWCAEQCA <= iRequiredTWQCA)
						{
							int iAssignToTWQCA = iRequiredTWQCA - (iNoofTWQCA - iNoofTWCAEQCA);
							iNoofCAE -= iAssignToTWQCA;
							iNoofTWCAE -= iAssignToTWQCA;
							iNoofTWQCA -= iNoofTWCAEQCA - iAssignToTWQCA;
							iNoofTWCAEQCA = 0;
						}
						else
						{
							// 專任的QCA大於需求人數, 所有的身兼二職組員都歸類到CAE
							iNoofTWQCA -= iNoofTWCAEQCA;
							iNoofTWCAEQCA = 0;
						}
					}

					// 檢查剩下的職缺是否能滿足法規需求
					if (iRequiredCAE > iNoofCAE + iUnassignComp ||
						iRequiredTWCAE > iNoofTWCAE + iUnassignCompTW ||
						iRequiredTWQCA > iNoofTWQCA + iUnassignCompTW ||
						iRequiredSpecificFrnCrew > iNoofSpecificFrnCrew + iUnassignComp ||
						iRequiredCAE + iRequiredTWQCA > iNoofCAE + iNoofTWQCA + iUnassignComp ||
						iRequiredTWCAE + iRequiredTWQCA > iNoofTWCAE + iNoofTWQCA + iUnassignCompTW ||
						iRequiredSpecificFrnCrew + iRequiredTWCAE > iNoofSpecificFrnCrew + iNoofTWCAE + iUnassignComp ||
						iRequiredSpecificFrnCrew + iRequiredTWQCA > iNoofSpecificFrnCrew + iNoofTWQCA + iUnassignComp ||
						iRequiredSpecificFrnCrew + iRequiredTWCAE + iRequiredTWQCA > iNoofSpecificFrnCrew + iNoofTWCAE + iNoofTWQCA + iUnassignComp)
					{
						CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
						string strRequired, strActual;
						rv->isLegal = false;
						rv->startUtc = iSegmentStart;
						rv->endUtc = iSegmentEnd;
						rv->pairingId = (*iter_roster)->pairId;
						rv->segmentId = segment->getDBId();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						if (iRequiredCAE > 0)
						{
							strRequired += boost::lexical_cast<string>(iRequiredCAE);
							strRequired += " CAE";
							strActual += boost::lexical_cast<string>(iNoofCAE);
							strActual += " CAE";
							if (iRequiredTWCAE > 0)
							{
								strRequired += "(";
								strRequired += boost::lexical_cast<string>(iRequiredTWCAE);
								strRequired += " TW CAE)";
								strActual += "(";
								strActual += boost::lexical_cast<string>(iNoofTWCAE);
								strActual += " TW CAE)";
							}
						}
						if (iRequiredTWQCA > 0)
						{
							if (strRequired.length() > 0)
							{
								strRequired += ", ";
							}
							if (strActual.length() > 0)
							{
								strActual += ", ";
							}
							strRequired += boost::lexical_cast<string>(iRequiredTWQCA);
							strRequired += " QCA";
							strActual += boost::lexical_cast<string>(iNoofTWQCA);
							strActual += " QCA";
						}
						if (iRequiredSpecificFrnCrew > 0)
						{
							if (strRequired.length() > 0)
							{
								strRequired += ", ";
							}
							if (strActual.length() > 0)
							{
								strActual += ", ";
							}
							strRequired += boost::lexical_cast<string>(iRequiredSpecificFrnCrew);
							strRequired += " ";
							strRequired += strSpecificCrewNationality;
							strActual += boost::lexical_cast<string>(iNoofSpecificFrnCrew);
							strActual += " ";
							strActual += strSpecificCrewNationality;
						}
						util_timeT_to_dateStr(iSegmentStart, date_buf, sizeof(date_buf));

						rv->legalMessage = "Require " + strRequired + ", actual " + strActual + " on " + 
							string(date_buf) + " "  segment->getFlightNumber() + "(" + (*iter_roster)->label + ")";
						rv->operation_result.insert(make_pair("requiredCrew", strRequired));
						rv->operation_result.insert(make_pair("actualCrew", strActual));
						rv->operation_result.insert(make_pair("flightDate", string(date_buf)));
						rv->operation_result.insert(make_pair("flightNumber", segment->getFlightNumber()));
						rv->operation_result.insert(make_pair("rosterLabel", (*iter_roster)->label));

						rvs.push_back(rv);
						if (this->application == ROSTER_OPTIMIZER)
						{
							return rvs;
						}
					}
				}
			}
		}
	}
	return rvs;
}

// 9020, MinJPN: Min JPN crew for JPN DP
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkMinJPN(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster;
	vector<long long>fltPairingList;
	string strNationality, strActingRanks, strPeerActingRanks;
	string strDepCountries, strDepAirports, strArrCountries, strArrAirports, strFlightNumbers;
	vector<string> vActingRank, vPeerActingRank, vDepCountry, vDepAirport;
	vector<string> vArrCountry, vArrAirport, vFlightNumber;
	int iMinCrew, iNationalityCrew;
	bool hasTargetCrew, hasPeerCrew;
	int iTotalCAComplement, iAssignedCAComplement;

	for (auto &iter : singleRule->params)
	{
		if (iter.first == "CREW NATIONALITY")
		{
			strNationality = iter.second;
		}
		else if (iter.first == "ACTING RANKS")
		{
			strActingRanks = iter.second;
			boost::split(vActingRank, strActingRanks, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "MIN CREW")
		{
			iMinCrew = boost::lexical_cast<int>(iter.second);
		}
		else if (iter.first == "PEER CREW ACTING RANKS")
		{
			strPeerActingRanks = iter.second;
			boost::split(vPeerActingRank, strPeerActingRanks, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "DEPARTURE COUNTRIES")
		{
			strDepCountries = iter.second;
			boost::split(vDepCountry, strDepCountries, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "DEPARTURE AIRPORTS")
		{
			strDepAirports = iter.second;
			boost::split(vDepAirport, strDepAirports, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "ARRIVAL COUNTRIES")
		{
			strArrCountries = iter.second;
			boost::split(vArrCountry, strArrCountries, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "ARRIVAL AIRPORTS")
		{
			strArrAirports = iter.second;
			boost::split(vArrAirport, strArrAirports, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "FLIGHT NUMBERS")
		{
			strFlightNumbers = iter.second;
			boost::split(vFlightNumber, strFlightNumbers, boost::is_any_of("|"), boost::token_compress_on);
		}
	}

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->dbData->crewOnFlt;
	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		if (this->application == ROSTER_OPTIMIZER && !(*iter_roster)->needRuleCheck) {
			continue;
		}
		if (!(*iter_roster)->pairing) {
			continue;
		}
		if ((*iter_roster)->actRestStrUtc < this->dbData->startUtc) {
			continue;
		}
		if (crew->nationality != strNationality && (*iter_roster)->actingRank != "CA") {
			// 非指定國籍的組員只需關注CA職級
			continue;
		}

		for (int i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
		{
			Duty* duty = (*iter_roster)->pairing->getDuty(i);
			for (int j = 0; j < duty->getNumSegments(); j++)
			{
				Segment* segment = duty->getSegment(j);
				if (strDepCountries != "*" && find(vDepCountry.begin(), vDepCountry.end(), this->dbData->findAirportCountry(segment->getDepStation())) == vDepCountry.end())
				{
					continue;
				}
				if (strDepAirports != "*" && find(vDepAirport.begin(), vDepAirport.end(), segment->getDepStation()) == vDepAirport.end())
				{
					continue;
				}
				if (strArrCountries != "*" && find(vArrCountry.begin(), vArrCountry.end(), this->dbData->findAirportCountry(segment->getArrStation())) == vArrCountry.end())
				{
					continue;
				}
				if (strArrAirports != "*" && find(vArrAirport.begin(), vArrAirport.end(), segment->getArrStation()) == vArrAirport.end())
				{
					continue;
				}
				if (strFlightNumbers != "*" && find(vFlightNumber.begin(), vFlightNumber.end(), segment->getFlightNumber()) == vFlightNumber.end())
				{
					continue;
				}
				if (crewsOnFlt.find(segment->getDBId()) != crewsOnFlt.end())
				{
					vector<SharedPtr<CrewOnFlight>>& cofOfCrew = crewsOnFlt.find(segment->getDBId())->second;
					hasTargetCrew = false;
					hasPeerCrew = false;
					iNationalityCrew = 0;
					iTotalCAComplement = 0;
					iAssignedCAComplement = 0;
					for (auto& cof : cofOfCrew)
					{
						if (cof->assignment == "OPR")
						{
							if (cof->actingRank == "CA")
							{
								iAssignedCAComplement++;
							}

							if (cof->crew->nationality == strNationality)
							{
								if (!hasTargetCrew)
								{
									if (find(vActingRank.begin(), vActingRank.end(), cof->actingRank) != vActingRank.end())
									{
										hasTargetCrew = true;
										iNationalityCrew++;
										continue; // 目標DP只計算一位, 其餘同國籍組員均要符合Peer Crew Acting Ranks的定義
									}
								}

								if (strPeerActingRanks == "*" || find(vPeerActingRank.begin(), vPeerActingRank.end(), cof->actingRank) != vPeerActingRank.end())
								{
									hasPeerCrew = true;
									iNationalityCrew++;
								}
							}
						}
					}

					// 有日籍DP但日籍組員不到2名
					if (hasTargetCrew && (!hasPeerCrew || iNationalityCrew < iMinCrew))
					{
						// 檢查CA的空缺
						fltPairingList = this->dbData->fltToPairingMap[segment->getDBId()];
						for (auto& iter_pairing : fltPairingList)
						{
							long long pairingId = iter_pairing;
							Pairing* flt_pairing = this->dbData->pairingIdMap[pairingId];
							map<string, int>& complementMap = flt_pairing->getComplements();

							for (int m = 0; m < flt_pairing->getNumDuties(); m++)
							{
								Duty* flt_duty = flt_pairing->getDuty(m);
								for (int n = 0; n < flt_duty->getNumSegments(); n++)
								{
									Segment* flt_segment = flt_duty->getSegment(n);

									if (flt_segment->getAssignment() == "OPR" &&
										flt_segment->getDBId() == segment->getDBId())
									{
										iTotalCAComplement += complementMap["CA"];
									}
								}
							}
						}

						if (iTotalCAComplement - iAssignedCAComplement < iMinCrew - iNationalityCrew)
						{
							CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
							string strRequired, strActual;
							rv->isLegal = false;
							rv->startUtc = segment->getStartTimeUtcAct();
							rv->endUtc = segment->getEndTimeUtcAct();
							rv->pairingId = (*iter_roster)->pairId;
							rv->segmentId = segment->getDBId();
							rv->legalMessage = (*iter_roster)->label + " is assigned with " + strNationality + " " + strActingRanks +
								" - requires at least " + boost::lexical_cast<string>(iMinCrew)+" qualified " + strNationality + " crew.";
							rv->operation_result.insert(make_pair("pairingLabel", (*iter_roster)->label));
							rv->operation_result.insert(make_pair("nationality", strNationality));
							rv->operation_result.insert(make_pair("actingRanks", strActingRanks));
							rv->operation_result.insert(make_pair("minCrew", boost::lexical_cast<string>(iMinCrew)));

							rvs.push_back(rv);
							if (this->application == ROSTER_OPTIMIZER)
							{
								return rvs;
							}
						}
					}
				}
			}
		}
	}

	return rvs;
}

// 9021, Acclimatize
std::vector<CUSTOM_VIOLATION*> CustomLegality::checkAcclimatize(SharedPtr<CREW> crew, DBRule* singleRule)
{
	std::vector<CUSTOM_VIOLATION*> rvs;
	vector<SharedPtr<ROSTER>> vRoster = crew->rosterList;
	vector<SharedPtr<ROSTER>>::iterator iter_roster, iter_roster1;
	vector<SharedPtr<DBRule_8014>> assignmentGroup = this->dbData->rule_8014;
	string strOutstation, strMinTimeZoneGap, strMinRest;
	string strExceptAssignments, strExceptTimeZoneGap;
	int iLayoverOutStationReq, iMinTimeZoneGap, iMinRest, iExceptTimeZoneGap;
	vector<string> vDutyException, vDutyGroupException;
	int iHomeOffset, iOutstationOffset;
	bool isLongOutstation;

	for (auto &iter : singleRule->params)
	{
		if (iter.first == "OUTSTATION ACCLIMATIZED CONDITION")
		{
			strOutstation = iter.second;
			iLayoverOutStationReq = Utility::GetInstancePtr()->convertToMinutes(strOutstation);
		}
		else if (iter.first == "MIN TIME ZONE GAP")
		{
			strMinTimeZoneGap = iter.second;
			iMinTimeZoneGap = Utility::GetInstancePtr()->convertToMinutes(strMinTimeZoneGap);
		}
		else if (iter.first == "MIN REST AT HOME BASE")
		{
			strMinRest = iter.second;
			iMinRest = Utility::GetInstancePtr()->convertToMinutes(strMinRest);
		}
		else if (iter.first == "OVERRIDE EXCEPTION ASSIGNMENT GROUPS")
		{
			strExceptAssignments = iter.second;
			boost::split(vDutyGroupException, strExceptAssignments, boost::is_any_of("|"), boost::token_compress_on);
		}
		else if (iter.first == "OVERRIDE EXCEPTION TIME ZONE GAP")
		{
			strExceptTimeZoneGap = iter.second;
			iExceptTimeZoneGap = Utility::GetInstancePtr()->convertToMinutes(strExceptTimeZoneGap);
		}
	}

	for (vector<string>::iterator group_it = vDutyGroupException.begin(); group_it != vDutyGroupException.end(); group_it++)
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignmentGroup.begin(); assignment != assignmentGroup.end(); assignment++)
		{
			if ((*assignment)->assignmentGroup == (*group_it))
			{
				vDutyException.push_back((*assignment)->assignemnt);
			}
		}
	}

	iHomeOffset = this->dbData->getAirportOffset(crew->getPrimeBase()) * 60;
	for (iter_roster = vRoster.begin(); iter_roster != vRoster.end(); iter_roster++)
	{
		isLongOutstation = false;
		iOutstationOffset = 0;
		if ((*iter_roster)->pairing)
		{
			// 找出每一段Layover的時區和休息時間
			for (int i = 0; i < (*iter_roster)->pairing->getNumDuties() - 1; i++)
			{
				Duty* duty = (*iter_roster)->pairing->getDuty(i);
				iOutstationOffset = (duty->getEndTimeLocSch() - duty->getEndTimeUtcSch()) / 60;
				if (TimezoneUtils::abs(iOutstationOffset - iHomeOffset) >= iMinTimeZoneGap)
				{
					if (duty->getActualRest() > iLayoverOutStationReq)
					{
						isLongOutstation = true;
						break;
					}
				}
			}
		}

		if (isLongOutstation)
		{
			time_t endUtcAtBase = (*iter_roster)->actRestStrUtc;
			int iNextArrOffset = iHomeOffset;
			iter_roster1 = iter_roster;
			while (++iter_roster1 != vRoster.end())
			{
				if ((*iter_roster1)->getStartTimeUtcAct() > endUtcAtBase + iMinRest * 60)
				{
					break;
				}
				if (Utility::GetInstancePtr()->isHalfRoster((*iter_roster1)))
				{
					if ((*iter_roster1)->location != crew->getPrimeBase())
					{
						// 回組員base的moving pattern
						endUtcAtBase = (*iter_roster1)->actRestStrUtc;
						continue;
					}
				}
				else if (find(vDutyException.begin(), vDutyException.end(), (*iter_roster1)->duty) != vDutyException.end())
				{
					continue;
				}

				bool isExcept = false;
				if ((*iter_roster1)->pairing && (*iter_roster1)->duty == "FLY")
				{
					// 檢查再次服勤的飛航勤務與前次目的地時差是否在3小時以內
					isExcept = true;
					for (int i = 0; i < (*iter_roster1)->pairing->getNumDuties(); i++)
					{
						Duty* duty = (*iter_roster1)->pairing->getDuty(i);
						for (int j = 0; j < duty->getNumSegments(); j++)
						{
							Segment* segment = duty->getSegment(j);
							if (segment->getArrStation() != (*iter_roster1)->location)
							{
								iNextArrOffset = (segment->getEndTimeLocSch() - segment->getEndTimeUtcSch()) / 60;
								if (TimezoneUtils::abs(iNextArrOffset - iOutstationOffset) > iExceptTimeZoneGap)
								{
									isExcept = false;
								}
							}
						}
					}
				}

				if (!isExcept)
				{
					if (this->application == ROSTER_OPTIMIZER && !(*iter_roster)->needRuleCheck && !(*iter_roster1)->needRuleCheck)
					{
						continue;
					}

					CUSTOM_VIOLATION *rv = new CUSTOM_VIOLATION();
					string strOffset1, strOffset2, strRestAtBase;
					int iRestAtBase = ((*iter_roster1)->actStrUtc - endUtcAtBase) / 60;
					rv->isLegal = false;
					rv->startUtc = endUtcAtBase;
					rv->endUtc = (*iter_roster1)->actRestStrUtc;
					strOffset1 = boost::str(boost::format("%+d:%02d") % (iOutstationOffset / 60) % (iOutstationOffset % 60));
					strOffset2 = boost::str(boost::format("%+d:%02d") % (iNextArrOffset / 60) % (iNextArrOffset % 60));
					strRestAtBase = boost::str(boost::format("%d:%02d") % (iRestAtBase / 60) % (iRestAtBase % 60));
					rv->legalMessage = "The time difference of " + (*iter_roster)->label + "(" + strOffset1 + ") and " +
						(*iter_roster1)->label + "(" + strOffset2 + ") is more than " + strExceptTimeZoneGap + " and only " +
						strRestAtBase + " rest time after duty, less than " + strMinRest;
					rv->operation_result.insert(make_pair("label1", (*iter_roster)->label));
					rv->operation_result.insert(make_pair("offset1", strOffset1));
					rv->operation_result.insert(make_pair("label2", (*iter_roster1)->label));
					rv->operation_result.insert(make_pair("offset2", strOffset2));
					rv->operation_result.insert(make_pair("timezones", strExceptTimeZoneGap));
					rv->operation_result.insert(make_pair("actualRest", strRestAtBase));
					rv->operation_result.insert(make_pair("minrest_base", strMinRest));

					rvs.push_back(rv);
					if (this->application == ROSTER_OPTIMIZER)
					{
						return rvs;
					}
				}
			}
		}
	}

	return rvs;
}
