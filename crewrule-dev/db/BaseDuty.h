#ifndef BaseDutyH
#define BaseDutyH

#include <vector>
#include "Segment.h"
// #include "activity.h"
#include "Activity.h"
//#include "ParameterRegistry.h"

using namespace std;

//class ParameterRegistry;

class BaseDuty : public Activity
{
public:
	static int count() { return 0; }
	static map<string, int> dutyCountMap;
	static map<string, int> getDutyCountMap();
	static void addDutyToCountMap(string name);

	BaseDuty();
	~BaseDuty() = default;
	BaseDuty(vector<Segment*> segVec);

	typedef enum {
		DUTY_PURE_OPR = 0, //'O'
		DUTY_POS_OWN = 1, //'P'
		DUTY_POS_OTR = 2, //'p'
		DUTY_DHD_OWN = 3, //'D'
		DUTY_DHD_OTR = 4, //'d'
		DUTY_FLY = 5, // 'F' include fly seg
		DUTY_BLANK_DAY = 6, // 'L' pure blank day
		DUTY_PAIRING_REST = 7, // 'R' rest time after pairing
		DUTY_FERRY = 8,
		MAX_DUTY_PLC_TYPES = 9
	}DUTY_TYPE;

	string getClassName() const { return "Duty"; }

	void setType(DUTY_TYPE typ){ _type = typ; }
	DUTY_TYPE getType() const {return _type;}

	void setId(long long id){_id = id;}
	long long getId() const {return _id;}

	void setSegments(vector<Segment*>& segs){ _segments.swap(segs); _numSegments = _segments.size(); }
	void appendSegment(Segment * seg){ _segments.push_back(seg); _numSegments = _segments.size(); }
	vector<Segment*> getSegments() const;
	const vector<Segment*>& getSegmentsRead() const;
	Segment * getSegment(const std::size_t id) const {return _segments[id];}
	std::size_t getNumSegments() const {return _segments.size();}

	void init();
	void calculateDutyValues();

	//20180111 ain
	//规范化 sch/act start/end utc/loc
	void setStartTimeUtcSch(time_t vl){ _schStartTimeUtc = vl; }
	time_t getStartTimeUtcSch() const { return _schStartTimeUtc; }
	void setEndTimeUtcSch(time_t vl){ _schEndTimeUtc = vl; }
	time_t getEndTimeUtcSch() const { return _schEndTimeUtc; }
	void setStartTimeLocSch(time_t vl){ _schStartTimeLoc = vl; }
	time_t getStartTimeLocSch() const { return _schStartTimeLoc; }
	void setEndTimeLocSch(time_t vl){ _schEndTimeLoc = vl; }
	time_t getEndTimeLocSch() const { return _schEndTimeLoc; }
	void setStartTimeUtcAct(time_t vl){ _actStartTimeUtc = vl; }
	time_t getStartTimeUtcAct() const { return _actStartTimeUtc; }
	void setEndTimeUtcAct(time_t vl){ _actEndTimeUtc = vl; }
	time_t getEndTimeUtcAct() const { return _actEndTimeUtc; }
	void setStartTimeLocAct(time_t vl){ _actStartTimeLoc = vl; }
	time_t getStartTimeLocAct() const { return _actStartTimeLoc; }
	void setEndTimeLocAct(time_t vl){ _actEndTimeLoc = vl; }
	time_t getEndTimeLocAct() const { return _actEndTimeLoc; }

	time_t getStartTime() const { return _schStartTimeLoc; }
	time_t getEndTime() const { return _schEndTimeLoc; }
	time_t getUtcStartTime() const { return _schStartTimeUtc; }
	time_t getUtcEndTime() const { return _schEndTimeUtc; }
	void setStartTime(time_t val) { this->_schStartTimeLoc = val; }
	void setStartTimeLocal(time_t val) { this->_schStartTimeLoc = val; }
	void setEndTime(time_t val) { this->_schEndTimeLoc = val; }
	void setEndTimeLocal(time_t val) { this->_schEndTimeLoc = val; }
	void setUtcStartTime(time_t val) { this->_schStartTimeUtc = val; }
	void setUtcEndTime(time_t val) { this->_schEndTimeUtc = val; }

	void calculateDP();

	void calculateDutyBlockTime();
	double getFlyHours() const {return _flyHours;}
	void setFlyHours(double v){ _flyHours = v; }

	Segment * getLastSegment() const;
	Segment * getLastFlySegment() const;
	Segment * getLastFdpSegment() const;
	Segment * getFirstSegment() const;
	Segment * getFirstFlySegment() const;
	Segment * getFirstFdpSegment() const;

	int getNumLandings() const {return _numLandings;}
	int getNumFlySegs() const {return _numFlySegs;}
	int getNumNonFlySegs() const {return _numNonFlySegs;}
	int getNumAircraftChanges() const { return _numAircraftChanges; }
	void setNumAircraftChanges(int v) {_numAircraftChanges = v;}

	////rule below
	//void setMinBrief(long checkin){ _mininal_briefMin = checkin; }
	//long getMinBrief() { return _mininal_briefMin; }

	//void setMinDebrief(long checkout){ _mininal_debriefMin = checkout; }
	//long getMinDebrief() { return _mininal_debriefMin; }

	void setTypeByStr(string v) {
		if (v == "O" || v == "DUTY_PURE_OPR") {
			this->_type = BaseDuty::DUTY_PURE_OPR;
		}
		else if (v == "P" || v == "DUTY_POS_OWN") {
			this->_type = BaseDuty::DUTY_POS_OWN;
		}
		else if (v == "p" || v == "DUTY_POS_OTR") {
			this->_type = BaseDuty::DUTY_POS_OTR;
		}
		else if (v == "D" || v == "DUTY_DHD_OWN") {
			this->_type = BaseDuty::DUTY_DHD_OWN;
		}
		else if (v == "d" || v == "DUTY_DHD_OTR") {
			this->_type = BaseDuty::DUTY_DHD_OTR;
		}
		else if (v == "F" || v == "DUTY_FLY") {
			this->_type = BaseDuty::DUTY_FLY;
		}
		else if (v == "L" || v == "DUTY_BLANK_DAY") {
			this->_type = BaseDuty::DUTY_BLANK_DAY;
		}
		else if (v == "R" || v == "DUTY_PAIRING_REST") {
			this->_type = BaseDuty::DUTY_PAIRING_REST;
		}
		else if (v == "Unknown" || v == "MAX_DUTY_PLC_TYPES") {
			this->_type = BaseDuty::MAX_DUTY_PLC_TYPES;
		}
	}
	const char * getTypeStr() const {
		if (_type == BaseDuty::DUTY_PURE_OPR) {
			return "O";
		}
		else if (_type == BaseDuty::DUTY_POS_OWN) {
			return "P";
		}
		else if (_type == BaseDuty::DUTY_POS_OTR) {
			return "p";
		}
		else if (_type == BaseDuty::DUTY_DHD_OWN) {
			return "D";
		}
		else if (_type == BaseDuty::DUTY_DHD_OTR) {
			return "d";
		}
		else if (_type == BaseDuty::DUTY_FLY) {
			return "F";
		}
		else if (_type == BaseDuty::DUTY_FERRY) {
			return "B";
		}
		else if (_type == BaseDuty::DUTY_BLANK_DAY) {
			return "L";
		}
		else if (_type == BaseDuty::DUTY_PAIRING_REST) {
			return "R";
		}
		else if (_type == BaseDuty::MAX_DUTY_PLC_TYPES) {
			return "Unknown";
		}
		return NULL;
	}
	const char * getTypeFullStr() const {
		if (_type == BaseDuty::DUTY_PURE_OPR) {
			return "DUTY_PURE_OPR";
		}
		else if (_type == BaseDuty::DUTY_POS_OWN) {
			return "DUTY_POS_OWN";
		}
		else if (_type == BaseDuty::DUTY_POS_OTR) {
			return "DUTY_POS_OTR";
		}
		else if (_type == BaseDuty::DUTY_DHD_OWN) {
			return "DUTY_DHD_OWN";
		}
		else if (_type == BaseDuty::DUTY_DHD_OTR) {
			return "DUTY_DHD_OTR";
		}
		else if (_type == BaseDuty::DUTY_FLY) {
			return "DUTY_FLY";
		}
		else if (_type == BaseDuty::DUTY_BLANK_DAY) {
			return "DUTY_BLANK_DAY";
		}
		else if (_type == BaseDuty::DUTY_PAIRING_REST) {
			return "DUTY_PAIRING_REST";
		}
		else if (_type == BaseDuty::MAX_DUTY_PLC_TYPES) {
			return "MAX_DUTY_PLC_TYPES";
		}
		return "Unknown";
	}

	void resetTypeBySegments();

	void setActualBriefMin(long briefMin);
	long getActualBriefMin() const;

	void setActualDebriefMin(long debriefMin);
	long getActualDebriefMin() const;

	//double getCreditHours() { return _creditHours; }
	//void setCreditHours(double creditHrs) { _creditHours = creditHrs; }

	//string getRegion() { return _region; }
	//void setRegion(string &region){ _region = region; }

	//void setMaxFDP(int maxfdp){
	//	if (maxfdp < _max_fdp)
	//		_max_fdp = maxfdp;
	//}
	//void setMaxDP(int maxdp){
	//	if (maxdp < _max_dp)
	//		_max_dp = maxdp;
	//}
	//void setMaxFT(int maxft){
	//	if (maxft < _max_ft)
	//		_max_ft = maxft;
	//}
	//int getMaxFDP() { return _max_fdp; }
	//int getMaxDP() { return _max_dp; }
	//int getMaxFT() { return _max_ft; }
	void setDutyType(DUTY_TYPE& v) {
		_dutyType = v;
	}
	DUTY_TYPE getDutyType() const {
		return _dutyType;
	}

protected:

	long long _id = 0;
	DUTY_TYPE _type = MAX_DUTY_PLC_TYPES;
	vector<Segment*> _segments;
	std::size_t _numSegments = 0;

	//long _deptTime;
	//long _arrvTime;

	time_t _schStartTimeUtc = 0;
	time_t _schEndTimeUtc = 0;
	time_t _schStartTimeLoc = 0; //duty start time include brief time
	time_t _schEndTimeLoc = 0; // duty end time include debrief time
	time_t _actStartTimeUtc = 0;
	time_t _actEndTimeUtc = 0;
	time_t _actStartTimeLoc = 0; //duty start time include brief time
	time_t _actEndTimeLoc = 0; // duty end time include debrief time

	////This duty type can be rest after pairing, layover, fly, training , etc.
	DUTY_TYPE _dutyType = MAX_DUTY_PLC_TYPES;

	//// cost structure related
	//int _crewDutyDayCount;
	double _blockTimeInHourDom = 0.0;    //Domestic
	double _blockTimeInHourIntl = 0.0;  //international
	double _flyHours = 0.0; // blk hours


	int _numLandings = 0;
	int _numFlySegs = 0;
	int _numNonFlySegs = 0;
	int _numAircraftChanges = 0;

	//string _region;
	long _act_briefMin = 0;
	long _act_debriefMin =0;
	ThreadLocal<long> _act_briefMin_thread = 0;
	ThreadLocal<long> _act_debriefMin_thread = 0;
};

#endif