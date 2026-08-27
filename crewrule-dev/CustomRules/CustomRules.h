#ifndef CustomRulesH
#define CustomRulesH

#include "../db/Pairing.h"
#include "../db/duty.h"
#include "../db/segment.h"
#include "../db/CrewDB.h"

#define TIME_MINUTE		60
#define TIME_HOUR		(60*60)
#define TIME_DAY		(24*60*60)
#define TW				"TW"
#define SEC_PER_HOUR	3600.0
#define FLOAT_TIME_DAY	86400.0
#define MAX_DAY			(365 * 999)
#define TPE_OFFSET		8
#define SEGMENT_PNC		"PNC"
#define SEGMENT_OPR		"OPR"

enum {
	FlightType_Domestic = 0,
	FlightType_ShortHaul,
	FlightType_ShortHaulWithRest,
	FlightType_LongHaul
};
typedef struct
{
	time_t timeStart;
	int    iFlight;
	int    iDutyTime;
	bool   isPreAssigned;
} TimeInfo;

struct __declspec(dllexport) CUSTOM_VIOLATION
{
	bool isLegal;
	long startUtc;
	long endUtc;
	long long rosterId = -1;
	long long pairingId = -1;
	long long segmentId = -1;
	int	type;  //0--crew,1--roster,2--pairing,3--duty,4--flight;
	int	msg_type = 0; // determine which text to use in java i18n
	std::string legalMessage;
	map<string, string> operation_result;
};

class __declspec(dllexport) CustomLegality
{
private:
	int application;
	SharedPtr<CrewDataContext> dbData;
	multimap<string, string> mapCrewExpiringFleet;

public:
	CustomLegality();
	~CustomLegality();
	void setData(int app, SharedPtr<CrewDataContext> data);

	void populateExipiringFleetRecency();
	long ConvertHHMMtoSeconds(string strHHMM);
	long GetTargetWorkingDate(string country, time_t startDate, int gapWorkingDays);
	int  CalculateGapWorkingDays(string country, time_t startDate, time_t endDate);
	bool getHolidayStartByCountryAndPeriod(vector<time_t>& timeHolidays, string strCountry, time_t timePeriodStart, time_t timePeriodEnd);
	int  getFlightType(Pairing* flightPairing);

	std::vector<CUSTOM_VIOLATION*> Custom_Rules_Check(SharedPtr<CREW> crew, DBRule* singleRule);

	std::vector<CUSTOM_VIOLATION*> checkTravelDocument(SharedPtr<CREW> crew, DBRule* singleRule);

	std::vector<CUSTOM_VIOLATION*> checkAfterLongDP(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkAfterReinstate(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkPassportAndVisa(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkStandbyAfterConsecutiveDuties(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkDayOffGap(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkLHSBBeforeConsecutiveDOs(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkMaxBHOfTotalLH(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkJPPNC(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkJP5DayDuty(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkExpatOprMoving(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkExpatLayover(SharedPtr<CREW> crew, DBRule* singleRule);

	std::vector<CUSTOM_VIOLATION*> checkConsecutiveFlight(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkDOHoliday(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkNightFltRst(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkFirstFLTaftPromotion(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkCon24FtFdp(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkCrewFleetRecency(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkNumberOfCAEQCA(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkMinJPN(SharedPtr<CREW> crew, DBRule* singleRule);
	std::vector<CUSTOM_VIOLATION*> checkAcclimatize(SharedPtr<CREW> crew, DBRule* singleRule);
};

#endif
