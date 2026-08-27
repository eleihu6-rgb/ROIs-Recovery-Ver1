#ifndef ACTIVITY_H
#define ACTIVITY_H

#include <string>
#include <set>
#include "ThreadLocal.h"

using namespace std;


//*******************************************
//抽象接口：
//获取类名，用于动态获取对象类型，类似RTTI
//如
//  if (activity->getClassName() == "Pairing")  {
//      Pairing * pairing = (Pairing*) activity;
//      ...
//*******************************************
//enum ACT_TIME_TYPE { ACT, SCH };
class Activity {
public:
	virtual string getClassName() const = 0;
	virtual void setStartTimeUtcSch(time_t vl) = 0;
	virtual time_t getStartTimeUtcSch() const = 0;
	virtual void setEndTimeUtcSch(time_t vl) = 0;
	virtual time_t getEndTimeUtcSch() const = 0;
	virtual void setStartTimeLocSch(time_t vl) = 0;
	virtual time_t getStartTimeLocSch() const = 0;
	virtual void setEndTimeLocSch(time_t vl) = 0;
	virtual time_t getEndTimeLocSch() const = 0;
	virtual void setStartTimeUtcAct(time_t vl) = 0;
	virtual time_t getStartTimeUtcAct() const = 0;
	virtual void setEndTimeUtcAct(time_t vl) = 0;
	virtual time_t getEndTimeUtcAct() const = 0;
	virtual void setStartTimeLocAct(time_t vl) = 0;
	virtual time_t getStartTimeLocAct() const = 0;
	virtual void setEndTimeLocAct(time_t vl) = 0;
	virtual time_t getEndTimeLocAct() const = 0;

	time_t getStartTimeUtc(string type) const {
		if (type == "SCH")
			return getStartTimeUtcSch();
		else
			return getStartTimeUtcAct();
	}

	void setStartTimeUtc(string type, time_t v1) {
		if (type == "SCH")
			setStartTimeUtcSch(v1);
		else
			setStartTimeUtcAct(v1);
	}

	time_t getEndTimeUtc(string type) const {
		if (type == "SCH")
			return getEndTimeUtcSch();
		else
			return getEndTimeUtcAct();
	}

	void setEndTimeUtc(string type, time_t v1) {
		if (type == "SCH")
			setEndTimeUtcSch(v1);
		else
			setEndTimeUtcAct(v1);
	}

	time_t getStartTimeLoc(string type) const {
		if (type == "SCH")
			return getStartTimeLocSch();
		else
			return getStartTimeLocAct();
	}

	void setStartTimeLoc(string type, time_t v1) {
		if (type == "SCH")
			setStartTimeLocSch(v1);
		else
			setStartTimeLocAct(v1);
	}

	time_t getEndTimeLoc(string type) const {
		if (type == "SCH")
			return getEndTimeLocSch();
		else
			return getEndTimeLocAct();
	}

	void setEndTimeLoc(string type, time_t v1) {
		if (type == "SCH")
			setEndTimeLocSch(v1);
		else
			setEndTimeLocAct(v1);
	}

	bool isOverlapWithUtc(const string type, const time_t windowStartTimeUtc, const time_t windowsEndTimeUtc) const {
		time_t startTimeUtc = this->getStartTimeUtc(type);
		time_t endTimeUtc = this->getEndTimeUtc(type);
		return (startTimeUtc >= windowStartTimeUtc && startTimeUtc <= windowsEndTimeUtc) ||
			(endTimeUtc >= windowStartTimeUtc && endTimeUtc <= windowsEndTimeUtc) ||
			(windowStartTimeUtc >= startTimeUtc && windowStartTimeUtc <= endTimeUtc) ||
			(windowsEndTimeUtc >= startTimeUtc && windowsEndTimeUtc <= endTimeUtc);
	}

	bool isOverlapWithLoc(const string type, const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc) const {
		time_t startTimeLoc = this->getStartTimeLoc(type);
		time_t endTimeLoc = this->getEndTimeLoc(type);
		return (startTimeLoc >= windowStartTimeLoc && startTimeLoc <= windowsEndTimeLoc) ||
			(endTimeLoc >= windowStartTimeLoc && endTimeLoc <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLoc && windowStartTimeLoc <= endTimeLoc) ||
			(windowsEndTimeLoc >= startTimeLoc && windowsEndTimeLoc <= endTimeLoc);
	}

	bool isOverlapWithUtcSch(const time_t windowStartTimeUtc, const time_t windowsEndTimeUtc) const {
		time_t startTimeUtcSch = this->getStartTimeUtcSch();
		time_t endTimeUtcSch = this->getEndTimeUtcSch();
		return (startTimeUtcSch >= windowStartTimeUtc && startTimeUtcSch <= windowsEndTimeUtc) ||
			(endTimeUtcSch >= windowStartTimeUtc && endTimeUtcSch <= windowsEndTimeUtc) ||
			(windowStartTimeUtc >= startTimeUtcSch && windowStartTimeUtc <= endTimeUtcSch) ||
			(windowsEndTimeUtc >= startTimeUtcSch && windowsEndTimeUtc <= endTimeUtcSch);
	}

	bool isOverlapWithUtcAct(const time_t windowStartTimeUtc, const time_t windowsEndTimeUtc) const {
		time_t startTimeUtcAct = this->getStartTimeUtcAct();
		time_t endTimeUtcAct = this->getEndTimeUtcAct();
		return (startTimeUtcAct >= windowStartTimeUtc && startTimeUtcAct <= windowsEndTimeUtc) ||
			(endTimeUtcAct >= windowStartTimeUtc && endTimeUtcAct <= windowsEndTimeUtc) ||
			(windowStartTimeUtc >= startTimeUtcAct && windowStartTimeUtc <= endTimeUtcAct) ||
			(windowsEndTimeUtc >= startTimeUtcAct && windowsEndTimeUtc <= endTimeUtcAct);
	}

	bool isOverlapWithLocSch(const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc) const {
		time_t startTimeLocSch = this->getStartTimeLocSch();
		time_t endTimeLocSch = this->getEndTimeLocSch();
		return (startTimeLocSch >= windowStartTimeLoc && startTimeLocSch <= windowsEndTimeLoc) ||
			(endTimeLocSch >= windowStartTimeLoc && endTimeLocSch <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLocSch && windowStartTimeLoc <= endTimeLocSch) ||
			(windowsEndTimeLoc >= startTimeLocSch && windowsEndTimeLoc <= endTimeLocSch);
	}

	bool isOverlapWithLocSch(const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc, const int offsetTZMinutes) const {
		time_t startTimeLocSch = this->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60;
		time_t endTimeLocSch = this->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60;
		return (startTimeLocSch >= windowStartTimeLoc && startTimeLocSch <= windowsEndTimeLoc) ||
			(endTimeLocSch >= windowStartTimeLoc && endTimeLocSch <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLocSch && windowStartTimeLoc <= endTimeLocSch) ||
			(windowsEndTimeLoc >= startTimeLocSch && windowsEndTimeLoc <= endTimeLocSch);
	}

	bool isOverlapWithLocAct(const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc) const {
		time_t startTimeLocAct = this->getStartTimeLocAct();
		time_t endTimeLocAct = this->getEndTimeLocAct();
		return (startTimeLocAct >= windowStartTimeLoc && startTimeLocAct <= windowsEndTimeLoc) ||
			(endTimeLocAct >= windowStartTimeLoc && endTimeLocAct <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLocAct && windowStartTimeLoc <= endTimeLocAct) ||
			(windowsEndTimeLoc >= startTimeLocAct && windowsEndTimeLoc <= endTimeLocAct);
	}

	bool isOverlapWithLocAct(const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc, const int offsetTZMinutes) const {
		time_t startTimeLocAct = this->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
		time_t endTimeLocAct = this->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
		return (startTimeLocAct >= windowStartTimeLoc && startTimeLocAct <= windowsEndTimeLoc) ||
			(endTimeLocAct >= windowStartTimeLoc && endTimeLocAct <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLocAct && windowStartTimeLoc <= endTimeLocAct) ||
			(windowsEndTimeLoc >= startTimeLocAct && windowsEndTimeLoc <= endTimeLocAct);
	}

	void reset() {
		//20181126 ain, 留空函数, 应在 seg/duty/pair/roster中各自继承实现
	}

public:
	inline bool isRedEye() const {
		return _isRedEye;
	}

	inline void setIsRedEye(const bool isRedEye) {
		_isRedEye = isRedEye;
    }

	inline int getRedEyeStartMinutes() const {
		return _redEyeStartMinutes;
	}

	inline void setRedEyeStartMinutes(const int redEyeStartMinutes) {
		_redEyeStartMinutes = redEyeStartMinutes;
	}

	inline int getRedEyeEndMinutes() const {
		return _redEyeEndMinutes;
	}

	inline void setRedEyeEndMinutes(const int redEyeEndMinutes) {
		_redEyeEndMinutes = redEyeEndMinutes;
	}

	//获得所有匹配到阶段
	const set<long long>& getPhases() const;
	void setPhases(const set<long long>& phaseIds);
	void clearPhases();
	void appendPhase(const long long phaseId);
	void removePhase(const long long phaseId);
private:
	bool _isRedEye = false;//是否红眼任务(临时存储)
	int _redEyeStartMinutes = -1;//红眼任务开始时间分钟数(临时存储)
	int _redEyeEndMinutes = -1;//红眼任务结束时间分钟数(临时存储)

	//待检查phase阶段
	ThreadLocal<set<long long>> _phaseIds;
	set<long long> _phaseIds_instance;
};
#endif//ACTIVITY_H