#ifndef CalculatorH
#define CalculatorH

#include "CrewDB.h"
class LegalityChecker;

//vector<SharedPtr<CREW_MANDAY_BASIC>> calculateManDay(SharedPtr<CrewDataContext> data, string sCrewID, SharedPtr<ROSTER> roster);
vector<SharedPtr<CREW_MANDAY_FD>>    calMandaysFdByAllRosters(LegalityChecker* ruleEngine, SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>>& rosters);
vector<SharedPtr<CREW_MANDAY_CC_AM>> calMandaysCcAmByAllRosters(LegalityChecker* ruleEngine, SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>>& rosters,bool bDebug=false);
void calNumOfDowngradeInAScenario(SharedPtr<CrewDataContext> data);
void calNumOfPatternInAScenario(SharedPtr<CrewDataContext> _dbData);

void updateDowngrade(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, bool isAddRsoter, time_t start, time_t end);

void calcualteCallinSbyFDP(SharedPtr<CrewDataContext> data, SharedPtr<CREW> crew, vector<string>* standbyAssignments);

long CalculateDPForPR(Duty* duty, SharedPtr<ROSTER> prevRoster, SharedPtr<ROSTER> roster, bool & beforeIsCallout, SharedPtr<CrewDataContext> dbData);

void CalculateDPForPR(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& nextRoster, SharedPtr<CrewDataContext> dbData);

void CalculateFDPAndDPForHX(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& currRoster);

int CalculateDPForHX(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& currRoster);

bool BeforeIsCallout(const SharedPtr<ROSTER>& preRoster, const SharedPtr<ROSTER>& currRoster);

time_t GetFDPStartByStandbyDefinitionForHX(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& currRoster, time_t originalStartTime);

void updatePatternStat(SharedPtr<CREW> crew, vector<SharedPtr<ROSTER>>& rosters, const vector<DBRule>& rules, bool isAddRsoter, time_t start = 0, time_t end = 0);
void updatePatternStatByDate(SharedPtr<CrewDataContext> _dbData, SharedPtr<CREW> crew, vector<SharedPtr<ROSTER>>& rosters, const vector<DBRule>& rules, bool isAddRsoter, time_t start = 0, time_t end = 0);

#ifdef WIN32
__declspec(dllexport) 
#endif
int getNumberOfDaysOffInScenario(SharedPtr<CrewDataContext> data, int crewIndex);

bool isMergeTwoRosterOk(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster, SharedPtr<CrewDataContext> data);

vector<SharedPtr<CREW_MANDAY_BASIC>> calCcAmPerDiemAllRosters(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>>& rosters);

/*注意：添加新CALCULATION_TYPES的枚举时特别注意
manday计算时 >=DO (100) 采用机组人员所在基地作为本地时间，代码： BasicCalculation::isCrewBaseTimezone
因此若添加新枚举类型若不使用机组人员所在基地作为本地时间，则值必须小于100，否则大于100
*/
enum CALCULATION_TYPES{
	//count the times
	BH = 0, //即：BLH。简称飞时， 航班飞行时间 + 签入和签出时间
	FT = 1,//简称飞时，航班飞行时间（航班落地时间-航班起飞时间）
	DP = 2, //执勤期Duty时间
	FDP= 3, //飞行执勤期FDP时间
	WP = 4, //已废弃
	PERDIEM = 5, //已废弃
	CUST_DP = 6, //定制化DP特殊处理
	EXTEND_WP=7,//已废弃
	HIGH_PLATEAU = 8, //高高原机场的飞时FT，航班飞行时间（航班落地时间-航班起飞时间）
	//Count number of types
	DO =100,//休息日时间
	SBY=101, //备份任务时间
	LEA=102, //请休假（病假、事假、产假等）
	GND=103, //地面任务时间
	CSB=104, //针对BR航司的CSB备份任务时间 特殊处理
	ASB=105, //针对BR航司的ASB备份任务时间 特殊处理
	HSB=106, //针对BR航司的HSB备份任务时间 特殊处理
	AL=107, //年假
	UA=108,  //休息日时间,	QQ客舱特有休息日
	GREY=109, //休息日时间,	QQ飞行特有休息日
	RDO=110, //休息日时间，QQ客舱和飞行都有休息日
	PFT=111, //2024.3.7 jiaxin.jin TG独有，大概只使用1年，1年后废弃
	DHD=112, //2024.12.3 jiaxin.jin EVAFD manday新增dhd标识
	SBY_DP=113, //20250514 jiaxin.jin ROSCRW-10153 manday新增SBY_DP
	DHD_DP=114  //20250514 jiaxin.jin ROSCRW-10153 manday新增DHD_DP
};



class BasicCalculation
{
private:
	Pairing* _pairing = NULL; //20180610 ain, mantis#3436, 补齐初始化_pairing=NULL
	LegalityChecker* _ruleEngine;
	SharedPtr<ROSTER> _roster;
	SharedPtr<CrewDataContext> _dbData;
	SharedPtr<CREW> _crew;
	bool isUseHistoryBlk = false;
	int  calMode = 0;
	string airlineCode;
	void getAirlineCode();
	void getHistoryFlag();
	void calcualteSegmentBlock();
	//void calcualteFDP();
	//void calcualteFT();
	//void calcualteDP();
	void calcualteCredit();//Calculate Pairing/Duty Credit Hours
	void calcualtePerDiem();//Calculate Pairing/Duty Per Diem Hours
	SharedPtr<ASSIGNMENT> getAssignment(string strAssignment);
	vector<SharedPtr<mandayTimes>> getCrewManDayTimes(vector<SharedPtr<ROSTER>>& rosterList, bool setCalculated = false);
	vector<SharedPtr<mandayTimes>> getCrewManDayFdpTimes(vector<SharedPtr<ROSTER>>& rosterList, bool setCalculated = false);
	vector<SharedPtr<mandayTimes>> getCrewManDayDpTimes(vector<SharedPtr<ROSTER>>& rosterList, bool setCalculated = false);

	void tryToMergeFdp(vector<SharedPtr<ROSTER>>& rosters, vector<SharedPtr<mandayTimes>>& result, int i);
	void tryToMergeDp(vector<SharedPtr<ROSTER>>& rosters, vector<SharedPtr<mandayTimes>>& result, int i);
	long getDutyFdp(SharedPtr<ROSTER>& roster, int j);
	double getDutyAssignmentDpPct(SharedPtr<ROSTER>& roster, int j);
	long getDutyBlh(SharedPtr<ROSTER>& roster, int j);
	long getCrewManDayAndFlightDutyPeriod(const SharedPtr<ROSTER>& roster, const int j);
	long getCrewManDayAndFlightDutyPeriod(const SharedPtr<ROSTER>& roster, const int j, vector<SharedPtr<mandayTimes>>& result);
	long getCrewManDayAndFerryDutyPeriod(const SharedPtr<ROSTER>& roster, const int j);
	long getCrewManDayAndFerryDutyPeriod(const SharedPtr<ROSTER>& roster, const int j, const vector<SharedPtr<mandayTimes>>& result);
	bool needCalcPH(string assignment, string qualifier, string location, string base);

	/*
	* 获得机组成员在排班周期内的承包小时数
	* @param idCrew 机组人员ID 
	* @param localDay 本地日期（天）
	* @return 在排班周期内的承包小时数。若为-1，则表示未配置承包小时数
	*/
	int getGuaranteeFlyingHour(const std::string& idCrew, const time_t localStartDay) const;

	bool isCrewBaseTimezone(const int types) const;

	//返回值：tuple<Segment的Credit(实际时间), 首月Segment的Credit(实际时间)>
	std::tuple<double,double> getSegmentActCreditInSec(const Segment* segment, const time_t firstMonthStartTimeUtcAct, const int offsetTZMinutes);
	//返回值：tuple<Segment的Credit(实际时间), 首月Segment的Credit(实际时间)>
	std::tuple<double, double> getSegmentSchCreditInSec(const Segment* segment, const time_t firstMonthStartTimeUtcSch, const int offsetTZMinutes);
	
public:
	BasicCalculation();
	
	void calcualteCrewsStatistics(SharedPtr<CrewDataContext> data);
	void clearCAFaireHistoryData(SharedPtr<CrewDataContext> data);

	BasicCalculation(SharedPtr<CrewDataContext> data);
	BasicCalculation(SharedPtr<CrewDataContext> data, SharedPtr<CREW> crew);
	~BasicCalculation();
	void setRuleEngine(LegalityChecker* ruleEngine);
	void setCalculatedObject(Pairing* pairing);
	void setCalculatedObject(SharedPtr<ROSTER> roster);
	void initialization();
	void calcualteRest();
	void calculateCommute(SharedPtr<CREW> crew);
	void calculate();

	vector<SharedPtr<CREW_MANDAY_BASIC>> calculateManDay();

	/*
	* @param rosters：当前crew的所有排班数据
	*/
	map<time_t, SharedPtr<CREW_MANDAY_BASIC>> calculateManDays(vector<SharedPtr<ROSTER>>& rosters,bool setCalculated = false);

	//计算credit，并合并到manday中
	void calculateManDayCredit(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算PerDiem，并合并到manday中
	void calculateManDayPerDiem(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算WorkingHour，并合并到manday中
	void calculateManDayWorkingHour(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算layoverDay，并合并到Manday中
	void calculateMandayLayoverDay(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算Duty Aloft(机组在飞机上时间)，并合并到manday中
	void calculateManDayDutyAloft(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//manday的BLH按照UTC保存
	void calculateMandayBLH(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//manday的Attribute按照crewBase保存
	void calculateMandayAttribute(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//manday的flightNumber按照crewBase保存
	void calculateMandayFlightNumber(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//manday的宇宙射线
	void calculateMandayRadiationDose(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算blh by dictionary
	void calculateBLHByDictionary(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算aug_blh,int_blh
	void calculateAugAndIntBlh(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算跨时区Duty的数量
	void calculateCrossTZDutyCount(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//计算DDO的数量,必须满足DDO定义法规(7401法规)要求
	void calculateMandayDDO(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated = false);

	//in minutes
	int getInstructorMinutes(SharedPtr<CREW>& pCrew, vector<SharedPtr<CREW_TEAM>>& teams, vector<SharedPtr<ROSTER>>& rosters, long start, long end);

	static int getInstanceCount();
	long getSBYInARange(vector<SharedPtr<ROSTER>>& rosters, time_t start, time_t end, vector<string>& sbyAssignments);

	//20180604 ain, OP#1689, 根据 Calculation_Manday定义获取start时间, 无定义按ACT
	time_t getStartUtc(Activity* item, CALCULATION_TYPES& type);
	time_t getEndUtc(Activity* item, CALCULATION_TYPES& type);

private:
	//计算credit，并合并到manday中
	void calculateManDayCreditForEvaFd(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated);
	void calculateManDayCreditForPR(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated);
	void calculateManDayCreditForCARS(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated);
};

#endif
