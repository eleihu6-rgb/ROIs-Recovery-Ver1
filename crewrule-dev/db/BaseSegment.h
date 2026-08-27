#ifndef BaseSegmentH
#define BaseSegmentH

#include <vector>
#include <map>
#include<iostream>
#include <string>
//#include "activity.h"
#include "Activity.h"

using namespace std;

class BaseSegment : public Activity
{
public:
	BaseSegment();
	/*Segment(int id, long startTime, long endTime, string depStation, string airlineCD, string seg_seq_nr1, string arrStation, 
		string flightNumber, long blkTime, int complementCAP, int complementFO, int complementFE, int complementRC, 
		int complementSO, int complementCC1, int complementCC2, int complementCC3, int complementCC4, int complementCC5, 
		int complementCC6, int complementCC7, string sofl_seq_nr2, string sch_id, string flightType, string nextLegNo, bool isFly);
	Segment(int id, long startTime, long endTime, string depStation, string arrStation, string crewLinkNum, 
		long blkTime, string flightType, string tailNum, string pairingNum);*/
	~BaseSegment() = default;

	string getClassName() const { return "Segment"; }

	void setId(long long id){ _id = id; }
	long long getId() const {return _id;}
	
	long long getDBId() const {return _dbid;}
	//long long getDbid(){ return _dbid; }
	void setDBId(long long dbid){ _dbid = dbid; }
	


	void setSegNumber(string val){ _flightNumber = val; }
	string getSegNumber() const { return _flightNumber; }

	void setFlightNumber(string flightNumber){ _flightNumber = flightNumber; }
    const string& getFlightNumber() const { return _flightNumber; }
    const string& getSoflNum() const { return _flightNumber; }

	//void setSegSeqNum(string seg_seq_num){ _segNumber = atoi(seg_seq_num.c_str()); }
	//int getSegSeqNum(){ return _segNumber; }

	void setDomIntType(string dom_int_type){ _dom_int_type = dom_int_type; }
	string getDomIntType() const { return _dom_int_type; }

	void setServiceType(string service_type) { _serviceType = service_type; }
	string getServiceType() const { return _serviceType; }

	void setFleetCD(string fleet){ _fleetCD = fleet; }
	string getFleetCD() const { return _fleetCD; };
	string getFltCode() const { return _fleetCD; };

	void setSubFleet(string subFleet) { _subFleet = subFleet; }
	string getSubFleet() const { return _subFleet; }

	void setAircraft(string aircraft) { _aircraft = aircraft; }
	string getAircraft() const { return _aircraft; }

	void setFTTime(long ftTime){ _ftTime = ftTime; };
	long getFTTime()
	{
		long lReturn = _ftTime;
		if (lReturn == 0)
		{
			lReturn = static_cast<long>(_schEndTimeUtc - _schStartTimeUtc);
		}
		return lReturn;
	}

	void setBlkTime(long blkTime){ _blkTime = blkTime; }
	long getBlkTime() const {

		/*
		int blh = 0;
		if ((_historicalBlock) && (_blk_min_history > 0))
			blh = _blk_min_history * 60;
		else if (_blkTime > 0)
			blh = _blkTime;
		else
		{
			if (this->getIsOperating())
			{
				_blkTime = (_schEndTimeUtc - _schStartTimeUtc);
			}
			else
				_blkTime = 0;
			blh = _blkTime;
		}
		return blh;
		*/
		return _blkTime;
	};
	void setBlkSeconds(long blkSecs) { _blkTime = blkSecs; }
	long getBlkSeconds() const {
		return getBlkTime();
	}
	long getBlkMinutes() const {
		return getBlkTime() / 60;
	}

	void setSchBlkTime(const long schBlkTime) { _schBlkTime = schBlkTime; }
	long getSchBlkTime() const { return _schBlkTime; };
	long getSchBlkMinutes() const {
		return getSchBlkTime() / 60;
	}

	void setDepStation(string depStation){ _depStation = depStation; }
	string getDepStation() const { return _depStation; };
	const string& getDepStationRead() const { return _depStation; };
	void setDepSta(string depStation){ _depStation = depStation; }
	string getDepSta() const { return _depStation; };

	void setArrStation(string arrStation){ _arrStation = arrStation; }
	string getArrStation() const { return _arrStation; };
	const string& getArrStationRead() const { return _arrStation; };
	void setArrSta(string arrStation){ _arrStation = arrStation; }
	string getArrSta() const {return _arrStation;};

	//20180111 ain
	//�淶�� sch/act start/end utc/loc
    void setStartTimeLocSch(time_t val) override { _schStartTimeLoc = val; }
	time_t getStartTimeLocSch() const override { return _schStartTimeLoc; }
	void setEndTimeLocSch(time_t val) override { _schEndTimeLoc = val; }
	time_t getEndTimeLocSch() const override { return _schEndTimeLoc; }
	void setStartTimeUtcSch(time_t val) override { _schStartTimeUtc = val; }
	time_t getStartTimeUtcSch() const override { return _schStartTimeUtc; }
	void setEndTimeUtcSch(time_t val) override { _schEndTimeUtc = val; }
	time_t getEndTimeUtcSch() const override { return _schEndTimeUtc; }
	void setStartTimeLocAct(time_t val)override { _actStartTimeLoc = val; }
	time_t getStartTimeLocAct() const override { return _actStartTimeLoc; }
	void setEndTimeLocAct(time_t val) override { _actEndTimeLoc = val; }
	time_t getEndTimeLocAct() const override { return _actEndTimeLoc; }
	void setStartTimeUtcAct(time_t val) override { _actStartTimeUtc = val; }
	time_t getStartTimeUtcAct() const override { return _actStartTimeUtc; }
	void setEndTimeUtcAct(time_t val) override { _actEndTimeUtc = val; }
	time_t getEndTimeUtcAct() const override { return _actEndTimeUtc; }
	//op#2410
	//20200731 ain, mantis#8546, ESTΪ����SCH������ֵ, �������EST�����߼��쳣����Brief.start
	void setEstDepDtUtc(time_t val){ _estDepDtUtc = val; }
	time_t getEstDepDtUtc() const { return _estDepDtUtc <= 0 ? _schStartTimeUtc : _estDepDtUtc; }
	void setEstDepDtLoc(time_t val){ _estDepDtLoc = val; }
	time_t getEstDepDtLoc() const { return _estDepDtLoc <= 0 ? _schStartTimeLoc : _estDepDtLoc; }
	void setEstArvDtUtc(time_t val){ _estArvDtUtc = val; }
	time_t getEstArvDtUtc() const { return _estArvDtUtc <= 0 ? _schEndTimeUtc : _estArvDtUtc; }
	void setEstArvDtLoc(time_t val){ _estArvDtLoc = val; }
	time_t getEstArvDtLoc() const { return _estArvDtLoc <= 0 ? _schEndTimeLoc : _estArvDtLoc; }

	void setActTakeOffLoc(const time_t val) { _actTakeOffLoc = val; }
	time_t getActTakeOffLoc() const { return _actTakeOffLoc; }
	void setActTouchDownUtc(const time_t val) { _actTouchDownUtc = val; }
	time_t getActTouchDownUtc() const { return _actTouchDownUtc; }
	void setActTouchDownLoc(const time_t val) { _actTouchDownLoc = val; }
	time_t getActTouchDownLoc() const { return _actTouchDownLoc; }
	void setActTakeOffUtc(const time_t val) { _actTakeOffUtc = val; }
	time_t getActTakeOffUtc() const { return _actTakeOffUtc; }
	void setActTaxiOutLoc(const time_t val) { _actTaxiOutLoc = val; }
	time_t getActTaxiOutLoc() const { return _actTaxiOutLoc; }
	void setActTaxiOutUtc(const time_t val) { _actTaxiOutUtc = val; }
	time_t getActTaxiOutUtc() const { return _actTaxiOutUtc; }
	void setActTaxiInUtc(const time_t val) { _actTaxiInUtc = val; }
	time_t getActTaxiInUtc() const { return _actTaxiInUtc; }
	void setActTaxiInLoc(const time_t val) { _actTaxiInLoc = val; }
	time_t getActTaxiInLoc() const { return _actTaxiInLoc; }

	time_t getStartTimeLocal() const { return _schStartTimeLoc; }
	time_t getStartTime() const { return _schStartTimeLoc; }
	time_t getEndTime() const { return _schEndTimeLoc; }
	time_t getUtcStartTime() const { return _schStartTimeUtc; }
	time_t getUtcEndTime() const { return _schEndTimeUtc; }
	void setUtcStartTime(time_t val) { this->_schStartTimeUtc = val; }
	void setUtcEndTime(time_t val) { this->_schEndTimeUtc = val; }

	void setNextLegNo(string nextLegNo){ _nextLegNo = nextLegNo; }
    const string& getNextLegNo() const { return _nextLegNo; }
	void setRegister(string fltRegister) { _register = fltRegister; }
    const string& getRegister() const { return _register; }


	//plan, open, and fill composition
	const map<string, int>& getPlanComposition() const { return _planComposition; }
	int getPlanCompositionValue(const string &rank) const { 
		auto it = _planComposition.find(rank);
		if (it != _planComposition.end())
			return it->second;
		return 0; 
	}
	void addPlanComposition(string &rank, int fillValue){
		_planComposition.insert(pair<string, int>(rank, fillValue));
		_openComposition.insert(pair<string, int>(rank, fillValue));
	}
	void setPlanComposition(const map<string, int>& v) {
		_planComposition.clear();
		_planComposition.insert(v.begin(), v.end());
	}

	void setOpenComposition(const map<string, int>& v) {
		_openComposition.clear();
		_openComposition.insert(v.begin(), v.end());
	}
	void setFillComposition(const map<string, int>& v) {
		_fillComposition.clear();
		_fillComposition.insert(v.begin(), v.end());
	}

	void setComplementsByRank(map<string, int> flightComplementMap){ _openComposition = flightComplementMap; }
	map<string, int> getComplementMap(){ return _openComposition; }
	const map<string, int>& getOpenComposition() const { return _openComposition; }
	int getRankComplement(const string& rankString) const {
		auto it = _openComposition.find(rankString);
		if (it != _openComposition.end())
			return it->second;
		return 0; 
	}
	
	const map<string, int>& getFillComposition() const { return _fillComposition; }
	bool fillCompositionRank(const string &rank, int fillValue);
	void resetOpenComposition(const map<string, int>& v) { _fillComposition.clear(); _openComposition.clear(); _openComposition.insert(v.begin(), v.end()); }
	void resetOpenComposition()                    { _fillComposition.clear(); _openComposition.clear(); _openComposition.insert(_planComposition.begin(), _planComposition.end()); }

	void setCompositionId(long long v) { _compositionId = v; }       // add by ain
	long long getCompositionId() const { return _compositionId; }         // add by ain
	
	void addDivisionCompositionId(string division, long long compId){ _divisionCompositionIdMap[division] = compId; }
	long long getDivisionCompositionId(string division) const {
		if (_divisionCompositionIdMap.find(division) == _divisionCompositionIdMap.end()){
			cout << "invalid data, divison not found " << division << endl;
			return -999;
		}
		return _divisionCompositionIdMap.at(division); 
	}

	void setCompositionHierarchy(int v) { _compositionHierarchy = v; }
	int getCompositionHierarchy() const { return _compositionHierarchy; }
	
	void setTurnTime(long val){ _turnTime = val; }
	long getTurnTime() const { return _turnTime; }

	void setTailNum(string val){ _tailNum = val; }
	const std::string& getTailNum() const { return _tailNum; }

    const std::string& getBase() const { return _base; }
	void setBase(string base){ _base = base; }

	void setAssignment(string assignment){ _assignment = assignment; }
    const std::string& getAssignment() const { return _assignment; }

	void setIsOperating(bool val){ _isOperating = val; }
	bool getIsOperating() const {
		return (_isOperating || this->_assignment == "FLY" || this->_assignment == "OPR" );
	}

	void setIsDeadhead(bool val){ _isDeadhead = val; }
	bool isDeadhead() const { return getIsDeadhead(); }
	bool getIsDeadhead() const { 
		return (_isDeadhead || this->_assignment == "DHD");
	}

	void setIsCovered(bool flag){_isCovered = flag;}
	bool getIsCovered() const {return _isCovered;}


	void setHistoricalBlhFlag(bool flag) { _historicalBlock = flag; }
	bool isHistoricalBlock() const { return _historicalBlock; }

	int  getBlkMinHistory() const { return _blk_min_history; }        // add by ain
	void setBlkMinHistory(int v) { _blk_min_history = v; }      // add by ain	

	string getRegion() const { return _region; }
	void setRegion(string region) { this->_region = region; }

	int getFltSegSeq() const { return _fltSegNum; } //
	void setFltSegSeq(int v) { _fltSegNum = v; } 
	const string& getAirline() const { return airline; }
	void setAirline(string v) { airline = v; }
	void init();

protected:
	long long _id = 0;
	long long _dbid = 0;//fltId
	int _fltSegNum = 0; //db FLIGHT.SEG_SEQ
	//string _seg_seq_num; //20171221 ain: ͳһseg.fltNum�� _flightNumber
	//int _segNumber;
	string _dom_int_type;
	string _fleetCD;
	string _subFleet;
	string _aircraft;
	long _blkTime = 0; //actual block time in second
	long _schBlkTime = 0; //schedule block time in second（EVA)
	long _ftTime = 0; //the flight time (no prorated)
	string _depStation;
	string _arrStation;
	string airline;
	time_t _schStartTimeUtc = 0;
	time_t _schEndTimeUtc = 0;
	time_t _schStartTimeLoc = 0;
	time_t _schEndTimeLoc = 0;
	time_t _actStartTimeUtc = 0;
	time_t _actEndTimeUtc = 0;
	time_t _actStartTimeLoc = 0;
	time_t _actEndTimeLoc = 0;


	//op#2410 
	time_t _estDepDtUtc = 0;
	time_t _estDepDtLoc = 0;
	time_t _estArvDtUtc = 0;
	time_t _estArvDtLoc = 0;

	time_t _actTakeOffLoc = 0;
	time_t _actTouchDownUtc = 0;
	time_t _actTouchDownLoc = 0;
	time_t _actTakeOffUtc = 0;
	time_t _actTaxiOutLoc = 0;
	time_t _actTaxiOutUtc = 0;
	time_t _actTaxiInUtc = 0;
	time_t _actTaxiInLoc = 0;

	string _nextLegNo;
	string _register;
	map<string, int> _openComposition;
	map<string, int> _planComposition;
	map<string, int> _fillComposition;
	map<string, long long> _divisionCompositionIdMap; //mantis5232�����ڴ洢��ͬdivision�µ�_planComposition
	long long  _compositionId = 0;
	int  _compositionHierarchy = 0;
	long _turnTime = 0;
	string _tailNum;
	string _base; // the segment belongs to which base
	string _assignment;
	bool _isOperating = false; // fly segment or deadhead segment
	bool _isDeadhead = false;
	bool _isCovered = false;
	string _flightNumber;

	bool _historicalBlock = false;
	int  _blk_min_history = 0;

	string _region;
	string _serviceType;
};


#endif