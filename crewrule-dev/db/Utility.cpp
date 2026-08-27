#include "Utility.h"
#include <iostream>
#include <math.h>
#include <time.h>
#include <algorithm>
#include "UtilFunc.h"
#include "RuleParams.h"
#include "StringUtil.h"
#include "Log/Logger.h"
#include "TimezoneUtils.h"
#include <iomanip>
#include <sstream>

#include "index/TmProgramIndex.h"

using  namespace  std;

#if defined(__unix) || defined(__APPLE__)
    #include <ctime>
    #define _mkgmtime timegm
    #define _mktime32 mktime
#endif


const int FAILURE = -1;

inline static bool MatchCourse(const SharedPtr<ROSTER>& roster, const vector<string>& courseCodes, const std::shared_ptr<CrewDataContext>& dbData) {
	if (roster == nullptr || courseCodes.empty()) {
		return true;
	}
	//从学员角度
	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto iterCourse = dbData->tmCourseMap.find(tmProgramCourse->courseId);
		if (iterCourse == dbData->tmCourseMap.end()) {
			continue;
		}
        auto& course = iterCourse->second;
		if (course != nullptr && std::find(courseCodes.begin(), courseCodes.end(), course->courseCode) != courseCodes.end()) {
			return true;
        }
	}

	return false;
}

// 类的静态成员变量要在类体外进行定义
Utility Utility::m_pStatic;

Utility::Utility()
{
	
}

Utility::~Utility()
{
	
}

Utility* Utility::GetInstancePtr()
{
	//if (NULL == m_pStatic)
	//{
	//	m_pStatic = new Utility();
	//}
	//20190222 ain, 单例模式改为基于对象, 避免mem leak
	return &m_pStatic;
}


bool Utility::likeFind(vector<string>& vecs, string toBeFind)
{
	for (auto& vec : vecs)
	{
		if (toBeFind.find(vec) != std::string::npos)
			return true;
	}
	return false;
}

void Utility::progressBar(int n)
{
	static int currentNumber = 0;
	if (n <= currentNumber)
		return;
	currentNumber = n;
	if (n == 1)
	{
		currentNumber = n;
		printf("Progress\n");
		printf("=  %d%%", n);
		fflush(stdout);
		return;
	}
	if (n<11)
		printf("\b\b\b\b");
	else
		printf("\b\b\b\b\b");
	printf("=  ");
	printf("%d%%", n);
	fflush(stdout);
}

//从HH:mm格式字符串中获取小时、分钟整数值
//str:   输入HH:mm字符串
//HH:    返回HH整数值
//mm:    返回mm整数值
void Utility::getHHMMfromStr(const char* str, int* HH, int* mm) {
	int h = 0, m = 0;
	int bIsHH = 1; //判断当前是否处于HH段， true表示HH段，false表示mm段
	if (str == NULL)
		return;
	if (strlen(str) < 3 || strlen(str) > 5)
		return;

	for (std::size_t i = 0; i < strlen(str); i++) {
		if (str[i] == ':') {
			bIsHH = 0; // false;
			continue;
		}
		if (bIsHH)
			h = (h * 10) + (str[i] - '0');
		else
			m = (m * 10) + (str[i] - '0');
	}

	*HH = h;
	*mm = m;
}

time_t Utility::addYears(time_t time, int numberOfYears)
{
	time_t t = time;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return time;
	}
	tt->tm_year += numberOfYears;

	return _mkgmtime(tt);
}

//only applicable to EVA
time_t Utility::getTrackingWindowEnd(int offsetMinutes)
{
	time_t windowEnd = 0;
	struct tm *local;
	time_t t = time(NULL);
	local = localtime(&t);
	time_t nextMonthStart = getLocalMonthEndInUTC(t, offsetMinutes) + 1;
	if (local->tm_mday >= 21)
	{
		windowEnd = getLocalMonthEndInUTC(nextMonthStart, offsetMinutes) + 1 + 5 * 24 * 3600;
	}
	else if (local->tm_mday <= 4)
	{
		windowEnd = nextMonthStart  + 5 * 24 * 3600;
	}
	else if (local->tm_mday > 4 && local->tm_mday <= 20)
	{
		windowEnd = nextMonthStart;
	}
	return windowEnd;
}

time_t Utility::addWeeks(time_t time, int numberOfWeeks) {
	return time + numberOfWeeks * 7 * 24 * 60 * 60;
}

time_t Utility::addMonths(time_t time,int numberOfMonths)
{
	time_t t = time;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return time;
	}
	tt->tm_mon += numberOfMonths;

	return _mkgmtime(tt);
}

time_t Utility::addMonths(time_t utcTime, int offsetTZMinute, int numberOfMonths)
{
	//time_t t = time;
	//tm * tt = gmtime(&t);
	//tt->tm_mon += numberOfMonths;

	//return _mkgmtime(tt);
	time_t t = utcTime + offsetTZMinute * 60;
	tm *tm = gmtime(&t);
	if (tm == nullptr) {
		return utcTime;
	}
	int year = tm->tm_year + 1900;
	int mon = (tm->tm_mon + 1) + numberOfMonths;
	int day = tm->tm_mday;
	int mdays = 0;

	while (mon < 1) {
		mon += 12;
		year--;
	}

	while (mon > 12) {
		mon -= 12;
		year++;
	}

	mdays = daysInMonth(year, mon);

	if (day > mdays) {
		if (numberOfMonths < 0) day = mdays - (day - mdays);
		else {
			day -= mdays;
			mon++;
			if (mon > 12) {
				year++;
				mon = 1;
			}
		}
	}

	tm->tm_year = year - 1900;
	tm->tm_mon = mon - 1;
	tm->tm_mday = day;
	return _mkgmtime(tm) - offsetTZMinute * 60;
}

int Utility::daysInMonth(const int year, const int month) {
	if (month < 1 || month > 12) {
		return -1; // 无效的月份
	}

	int daysInMonth;
	if (month == 2) {
		if ((year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)) {
			daysInMonth = 29; // 闰年2月有29天
		}
		else {
			daysInMonth = 28; // 平年2月有28天
		}
	}
	else if (month == 4 || month == 6 || month == 9 || month == 11) {
		daysInMonth = 30; // 四月、六月、九月、十一月有30天
	}
	else {
		daysInMonth = 31; // 其他月份有31天
	}

	return daysInMonth;
}

time_t Utility::getBirthdayInAYear(time_t thisyear, tm birthday)
{
	tm gm = { 0 };
	long gt = 0;
#ifdef _WIN32
	errno_t err1 = _gmtime32_s(&gm, (__time32_t *)&thisyear);
#else
	gmtime_r(&thisyear, &gm);
#endif
	birthday.tm_year = gm.tm_year;
	return _mkgmtime(&birthday);
}

time_t Utility::getLocalMonthEndInUTC(time_t utc, int offsetMinutes, int num)
{
	utc += offsetMinutes * 60;
	utc -= utc % (3600 * 24);
	time_t t = utc;
	tm* tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	tt->tm_mon = tt->tm_mon + num;
	tt->tm_mday = 1;
	return _mkgmtime(tt) - offsetMinutes * 60 - 1;
}

time_t Utility::getLocalQuarterEndInUTC(time_t utc, int offsetMinutes)
{
	utc += offsetMinutes * 60;
	utc -= utc % (3600 * 24);
	time_t t = utc;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	tt->tm_mon = tt->tm_mon + 3;
	tt->tm_mday = 1;
	return _mkgmtime(tt) - offsetMinutes * 60 - 1;
}

/*
retNext=True, 返回下一个整点
=False，返回前一个整点
times为整点，返回原值
*/
time_t Utility::getTimeByRoundHour(time_t times, bool retNext)
{
	time_t retu = times - (times % (60 * 60));
	if (retu < times && retNext)
		retu += 60 * 60;
	return retu;
}

time_t Utility::getLocalYearStartInUTC(time_t utc, int offsetMinutes)
{
	utc += offsetMinutes * 60;
	utc -= utc % (3600 * 24);
	time_t t = utc;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	tt->tm_mon = 0;
	tt->tm_mday = 1;
	return _mkgmtime(tt) - offsetMinutes * 60;
}
time_t Utility::getLocalYearEndInUTC(time_t utc, int offsetMinutes)
{
	utc += offsetMinutes * 60;
	utc -= utc % (3600 * 24);
	time_t t = utc;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	tt->tm_year++;
	tt->tm_mon = 0;
	tt->tm_mday = 1;
	return  _mkgmtime(tt) - offsetMinutes * 60 - 1;
}

//以星期日为一周的开始
time_t Utility::getLocalWeekStartInUTC(const time_t utc, const string& weekdayStartFrom, const int offsetMinutes)
{
	time_t _utc = utc + offsetMinutes * 60;
	_utc -= _utc % (3600 * 24);
	time_t t = _utc;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	int weekDay = tt->tm_wday; // 0=Sun,1=Mon,...,6=Sat
	int origWeekDay = weekDay;
	int weekStart = 0;
	if (weekdayStartFrom == "MON") {
		weekStart = 1;
	}
	else if (weekdayStartFrom == "TUE") {
		weekStart = 2;
	}
	else if (weekdayStartFrom == "WED") {
		weekStart = 3;
	}
	else if (weekdayStartFrom == "THU") {
		weekStart = 4;
	}
	else if (weekdayStartFrom == "FRI") {
		weekStart = 5;
	}
	else if (weekdayStartFrom == "SAT") {
		weekStart = 6;
	}
	if (weekdayStartFrom == "MON") {
		if (weekDay == 0) {
			weekDay = 7;//若周一第1天，则周日第7天
		}
		weekDay = weekDay  -1;
	}
	int diff = (origWeekDay - weekStart + 7) % 7;
	t = _mkgmtime(tt) - diff * 86400 - offsetMinutes * 60;
	return t;
}

//以星期六为一周的结束
time_t Utility::getLocalWeekEndInUTC(const time_t utc, const string& weekdayStartFrom, const int offsetMinutes)
{
	time_t utcWeekStart = getLocalWeekStartInUTC(utc, weekdayStartFrom, offsetMinutes);
	utcWeekStart += 7 * 24 * 60 * 60 - 1;
	return utcWeekStart;
}

time_t Utility::getLocalMonthStartInUTC(time_t utc, int offsetMinutes)
{
	utc += offsetMinutes * 60;
	utc -= utc % (3600 * 24);
	time_t t = utc;
	tm * tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	tt->tm_mday = 1;
	return _mkgmtime(tt) - offsetMinutes * 60;

}

time_t Utility::getLocalQuarterStartInUtc(time_t utc, int offsetMinutes)
{
	utc += offsetMinutes * 60;
	time_t t = utc;
	tm* tt = gmtime(&t);
	if (tt == nullptr) {
		return utc;
	}
	int month = tt->tm_mon;

	// 确定季度开始月份
	int quarterStartMonth;
	if (month >= 0 && month <= 2) {      // 第一季度：1月-3月
		quarterStartMonth = 0;           // 1月（月份从0开始）
	}
	else if (month >= 3 && month <= 5) { // 第二季度：4月-6月
		quarterStartMonth = 3;           // 4月
	}
	else if (month >= 6 && month <= 8) { // 第三季度：7月-9月
		quarterStartMonth = 6;           // 7月
	}
	else {                             // 第四季度：10月-12月
		quarterStartMonth = 9;           // 10月
	}

	// 设置季度开始时间
	tt->tm_mon = quarterStartMonth;
	tt->tm_mday = 1;                  // 每季度第一天
	tt->tm_hour = 0;
	tt->tm_min = 0;
	tt->tm_sec = 0;
	tt->tm_isdst = -1;                // 不确定夏令时

	return _mkgmtime(tt) - offsetMinutes * 60;
}

time_t Utility::getLocalHourStartInUTC(time_t utc, int offsetMinutes) {
	time_t localtime = utc + offsetMinutes * 60;
	return static_cast<time_t>((localtime/(60 * 60)) * (60*60)) - offsetMinutes * 60;//输出时间UTC+0时区
}

time_t Utility::getLocalHourEndInUTC(time_t utc, int offsetMinutes) {
	return getLocalHourStartInUTC(utc, offsetMinutes) + static_cast <time_t>(60 * 60 - 1);
}

int Utility::getYear(const time_t time) {
	tm* tt = gmtime(&time);
	if (tt == nullptr) {
		return 1970;
	}
	return tt->tm_year + 1900;
}

bool Utility::isSameYear(const time_t start, const time_t end) {
	tm* mStart = gmtime(&start);

	tm* mEnd = gmtime(&end);
	if (mStart == nullptr || mEnd == nullptr) {
		return false;
	}
	return mStart->tm_year == mEnd->tm_year;
}

// 计算用utc表达的本地时日历日开始时间，传入 utc + offsetMinutes (本地时对应时区)
// 例如：utc 1713146400 + offsetMinutes 480 (2024年4月15日早上10点00分 GMT+08:00)，返回结果为 1713110400 （2024年4月15日凌晨12点00分 GMT+08:00， 或 2024年4月14日PM4点00分 GMT）	
time_t Utility::getLocalDayStartInUTC(time_t utc, int offsetMinutes){
	
	time_t localtime = utc + offsetMinutes * 60;

	tm gm = { 0 };
	long gt = 0;
#ifdef _WIN32
	errno_t err1 = _gmtime32_s(&gm, (__time32_t *)&localtime);
#else
	gmtime_r(&localtime, &gm);
#endif
	
	auto localSeconds = gm.tm_hour * 3600 + gm.tm_min * 60 + gm.tm_sec;
	return (utc - localSeconds);
}

//此处的local date不是本地时，是offsetHours所在时区的时间
time_t Utility::LocalDateToUtc(tm local, int offsetMinutes) {
	time_t t = _mkgmtime(&local);
	return t - offsetMinutes * 60;
}

//("23:59") returns 1439
//("06:8") returns 368
//("6:08") returns 368
//("6:8") returns 368
//("6") returns 360
//("6;8") returns 360
int Utility::convertToMinutes(const string& strMinutes)
{
	
	auto index = strMinutes.find(':');
	if (index == string::npos)
		return 0;
	// if cannot find ':', index = size+1 and following code will treat strMinutes as hour input, so "6" returns 480 minutes
	int hours = std::stoi(strMinutes.substr(0, index));
	int minutes = 0;
	if (index != string::npos)
		minutes = std::stoi(strMinutes.substr(index + 1, 2));

	int total_minutes = hours * 60 + minutes;
	return total_minutes;
}

bool Utility::isHalfRoster(SharedPtr<ROSTER>& roster)
{
	bool bReturn = false;

	if (roster->pairing)
	{
		vector<Duty *> duties = roster->pairing->getDutyVec();
		if (duties.size() == 1)
		{
			//if (duties[0]->getDepStation() != duties[0]->getArrStation())
			if (!(isInSameCity(duties[0]->getDepStation(), duties[0]->getArrStation())))
			{
				vector<Segment*> segments = duties[0]->getSegments();
				if (segments.size() == 1)
					bReturn = true;
			}
		}

	}

	return bReturn;
}


//计算从start时间往前, 在rests范围内是否有X连续local nights
//这个连续local nights没有必要前后相连，也就是可以中间有duty分割
//如晚上休息，白天执行任务
//startAtMostTm,也就是在[startAtMostTm,startTm]范围里找
int Utility::hasXConsecutiveLocalNightsBeforeTm(vector<Rest_Ranges*> rests, int X, time_t startTm, Local_Night_Definition locals, int offsetMinutes, time_t startAtMostTm, bool searchMaxNumInRange)
{
	//bool hasRequired = false;
	int intervalInMinutes;
	//if (locals.MinRestInterval == "00:00")
	//	return true;
	if (rests.size() == 0)
		return 0;
	int startOfLocalInMinutes = convertToMinutes(locals.LocalStart);
	int endOfLocalInMinutes = convertToMinutes(locals.LocalEnd); 
	if (locals.MinRestInterval != "00:00")
		intervalInMinutes = convertToMinutes(locals.MinRestInterval);
	else
	{
		if (endOfLocalInMinutes > startOfLocalInMinutes)
			intervalInMinutes = endOfLocalInMinutes - startOfLocalInMinutes;
		else
			intervalInMinutes = endOfLocalInMinutes - startOfLocalInMinutes + 24*60;
	}

	time_t DayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTm, offsetMinutes);
	int temp = endOfLocalInMinutes + 24 * 60 - startOfLocalInMinutes - intervalInMinutes;
	if (temp == 24 * 60)
		temp = 0;
	time_t startOfStartUtcTemp, endOfStartUtcTemp;
	//6,8
	time_t startOfEndUtcTemp, endOfEndUtcTemp;
	//当天不满足
	if (startTm < DayStart + endOfLocalInMinutes * 60 - temp * 60)
	{
		startOfEndUtcTemp = DayStart - (24 * 60 * 60) + endOfLocalInMinutes * 60 - temp * 60;
		endOfEndUtcTemp = startOfEndUtcTemp + temp * 60;

		if (endOfLocalInMinutes>startOfLocalInMinutes)
			startOfStartUtcTemp = DayStart - ((24 * 60 * 60) - startOfLocalInMinutes * 60);
		else
			startOfStartUtcTemp = DayStart - (24 * 60 * 60) - ((24 * 60 * 60) - startOfLocalInMinutes * 60);
		endOfStartUtcTemp = startOfStartUtcTemp + temp * 60;
	}
	else //当天满足
	{
		startOfEndUtcTemp = DayStart + endOfLocalInMinutes * 60 - temp * 60;
		endOfEndUtcTemp = startOfEndUtcTemp + temp * 60;

		if (endOfLocalInMinutes>startOfLocalInMinutes)
			startOfStartUtcTemp = DayStart + startOfLocalInMinutes * 60;
		else
			startOfStartUtcTemp = DayStart - ((24 * 60 * 60) - startOfLocalInMinutes * 60);
		endOfStartUtcTemp = startOfStartUtcTemp + temp * 60;
	}


	//22,24
	time_t startOfStartUtc, endOfStartUtc;
	//6,8
	time_t startOfEndUtc, endOfEndUtc;
	int iConsecutiveNights = 0;
	int iMaxConseNights = 0;
	for (int i = 0; i < X; i++)
	{
		startOfEndUtc = startOfEndUtcTemp - i*(24 * 60 * 60);
		endOfEndUtc = startOfEndUtc + temp * 60;

		startOfStartUtc = startOfStartUtcTemp - i*(24 * 60 * 60);
		endOfStartUtc = startOfStartUtc + temp * 60;
		bool bFound = false;
		for (vector<Rest_Ranges*>::reverse_iterator rit = rests.rbegin(); rit != rests.rend(); ++rit)
		{			
			time_t restStart = (*rit)->startInUtc;
			time_t restEnd = (*rit)->endInUtc;
			if (restEnd < startAtMostTm)
				continue;
			restStart = std::max(restStart, startAtMostTm);

			if (!bFound){
				if ((restEnd - restStart) >= intervalInMinutes * 60){
					if (((restStart >= startOfStartUtc) && (restStart <= endOfStartUtc)) ||
						((restEnd >= startOfEndUtc) && (restEnd <= endOfEndUtc)) ||
						((restEnd >= endOfEndUtc) && (restStart <= startOfStartUtc)))
					{
						bFound = true;
						iConsecutiveNights++;
						iMaxConseNights = max(iMaxConseNights, iConsecutiveNights);
					}
				}
			}
		}
		if (!bFound && !searchMaxNumInRange)
		{
			return iConsecutiveNights;
		}
		else if (!bFound && searchMaxNumInRange)
		{
			iConsecutiveNights = 0;
		}
	}
	if (searchMaxNumInRange)
		iConsecutiveNights = iMaxConseNights;
	
	return iConsecutiveNights;

}

bool Utility::hasROAssignedRosterInRange(vector<SharedPtr<ROSTER>>& rosters, time_t start, time_t end)
{
	bool bReturn = false;

	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if (isTimeOverlap((*roster)->actStrUtc, (*roster)->actEndUtc, start, end))
		{
			if ((*roster)->source != "PA")
			{
				bReturn = true;
				break;
			}
		}
	}

	return bReturn;
}


//计算rest_range范围内有几个local nights
int Utility::howManyLocalNightsInRest(time_t start, time_t end, int maxLocalNighs, Local_Night_Definition locals, int offsetMinutes){
	int numberOfLocalNights = 0;

	vector<Rest_Ranges*> rests;
	vector<SharedPtr<ROSTER>>::iterator it_roster, prev_roster;

	Rest_Ranges *rest = new Rest_Ranges();
	rest->startInUtc = start;
	rest->endInUtc = end;
	rests.push_back(rest);
	numberOfLocalNights = hasXConsecutiveLocalNightsBeforeTm(rests, std::min((long)maxLocalNighs,(long)(1+(end-start)/(24*3600))), end, locals, offsetMinutes);
	delete rest;
	return numberOfLocalNights;
}

bool rest_cmp(Rest_Ranges* m1, Rest_Ranges* m2)  {
	return m1->endInUtc < m2->endInUtc;
}




/*
endUtcTm：local nights开始时间
numberOfLocalNights:需要local nights数量
locals:本地local night定义
offsetMinutes：本地时和UTC之间的OFFSET分钟
返回符合要求的结束时间，UTC为单位
***适用于检查航后休息
*/
time_t Utility::getRestByNumberOfLocalNights(time_t endUtcTm, int numberOfLocalNights, Local_Night_Definition locals, int offsetMinutes)
{
	if (locals.MinRestInterval == "00:00")
		return endUtcTm;
	int startOfLocalInMinutes = convertToMinutes(locals.LocalStart);
	int endOfLocalInMinutes = convertToMinutes(locals.LocalEnd); 
	int intervalInMinutes = convertToMinutes(locals.MinRestInterval); 
	int temp = endOfLocalInMinutes + 24 * 60 - startOfLocalInMinutes - intervalInMinutes;
	//暂时支持endOfStartForLocal<=24*60情形；如22到8点之间满足6小时休息算local nights的例子，暂时不支持。（概率小）
	int endOfStartForLocal = startOfLocalInMinutes + temp;
	int startOfEndForLocal = endOfLocalInMinutes - temp;
	int temp2 = endOfStartForLocal;
	if (temp2 >= 24 * 60)
		temp2 = temp2 - 24 * 60;
	time_t tmTime = endUtcTm;
	struct tm* tm = gmtime(&tmTime);
	//if (tm->tm_hour + offset > 23){
	//	tm->tm_hour += offset - 24;
	//}
	//else
	//	tm->tm_hour += offset;
	//int endLocalTm = tm->tm_hour * 60 + tm->tm_min;

	auto utcMinutes = tm->tm_hour * 60 + tm->tm_min;
	auto localMinutes = utcMinutes + offsetMinutes;
	auto endLocalTm = localMinutes % 1440; // 24 * 60 minutes in a day

	time_t restInUtc = endUtcTm;

	if (endLocalTm >= temp2 && endLocalTm <= endOfStartForLocal && temp2 < endOfStartForLocal)
		restInUtc += (24 * 60 - endLocalTm) * 60 + (numberOfLocalNights - 1) * 24 * 60 * 60 + startOfEndForLocal * 60;
	if (endLocalTm <= temp2)
		restInUtc += (24 * 60 - endLocalTm) * 60 + (numberOfLocalNights - 1) * 24 * 60 * 60 + startOfEndForLocal * 60;
	return restInUtc;
}

vector<Rest_Ranges*> Utility::getRestRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, bool bCountPostRest,vector<string> restAssignmentGroups)
{
	vector<Rest_Ranges*> rests;
	vector<SharedPtr<ROSTER>>::iterator it_roster, prev_roster;

	//rest before first roster
	Rest_Ranges *rest_before_roster = new Rest_Ranges();
	rest_before_roster->startInUtc = startUtc;
	if (rosters.size()>0)
	{
		rest_before_roster->endInUtc = rosters[rosters.size() - 1]->actStrUtc;
		for (it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
		{
			bool bRest = RuleParams::GetInstancePtr()->isRestAssignment((*it_roster)->qualifier, (*it_roster)->duty);
			if (find(restAssignmentGroups.begin(), restAssignmentGroups.end(), (*it_roster)->duty) != restAssignmentGroups.end() || bRest)
				continue;
			else
			{
				rest_before_roster->endInUtc = (*it_roster)->actStrUtc;
				break;
			}
		}
	}
	else
		rest_before_roster->endInUtc = endUtc;
	if (startUtc <= rest_before_roster->endInUtc)
	{
		if (rosters.size() == 0)
			rests.push_back(rest_before_roster);
		else if (rosters.size() > 0 )
			rests.push_back(rest_before_roster);
	}

	prev_roster = rosters.begin();

	for (it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
	{
		if ((*it_roster)->actStrUtc > endUtc)
			break;

		if ((*it_roster)->actEndUtc < startUtc)
		{
			prev_roster = it_roster;
			continue;
		}
		bool bRest = RuleParams::GetInstancePtr()->isRestAssignment((*it_roster)->qualifier, (*it_roster)->duty);
		if (find(restAssignmentGroups.begin(), restAssignmentGroups.end(), (*it_roster)->duty) != restAssignmentGroups.end() ||
			bRest)
			continue;

		if (it_roster != rosters.begin())
		{
			Rest_Ranges *rest_between_rosters = new Rest_Ranges();
			if (bCountPostRest)
				rest_between_rosters->startInUtc = (*prev_roster)->actRestStrUtc;
			else
				rest_between_rosters->startInUtc = (*prev_roster)->actEndUtc;
			rest_between_rosters->endInUtc = (*it_roster)->actStrUtc;
			if (rest_between_rosters->endInUtc <= endUtc) 
				rests.push_back(rest_between_rosters);
		}
		prev_roster = it_roster;
	}

	//rest after last roster
	Rest_Ranges *rest_after_roster = new Rest_Ranges();
	rest_after_roster->endInUtc = endUtc;
	int i = (int)rosters.size();
	if (i > 0)
	{
		if (bCountPostRest)
			rest_after_roster->startInUtc = rosters[i - 1]->actRestStrUtc;
		else
			rest_after_roster->startInUtc = rosters[i - 1]->actEndUtc;
		if (rest_after_roster->startInUtc <= rest_after_roster->endInUtc)
			rests.push_back(rest_after_roster);
	}

	stable_sort(rests.begin(), rests.end(), rest_cmp);
	return rests;
}


vector<Rest_Ranges*> Utility::getRestRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, bool bCoutLayover, string restBase)
{
	vector<Rest_Ranges*> rests;
	vector<SharedPtr<ROSTER>>::iterator it_roster, prev_roster;

	//rest before first roster
	Rest_Ranges *rest_before_roster = new Rest_Ranges();
	rest_before_roster->startInUtc = startUtc;
	if (rosters.size()>0 && rosters[0]->actStrUtc < endUtc)
	{
		rest_before_roster->endInUtc = rosters[rosters.size()-1]->actStrUtc;
		for (it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
		{
			string rosterRestBase = (*it_roster)->pairing ? (*it_roster)->pairing->getEndArp() : (*it_roster)->location;
			if (restBase == "*" || isInSameCity(restBase, rosterRestBase))
			{
				bool bRest = RuleParams::GetInstancePtr()->isRestAssignment((*it_roster)->qualifier, (*it_roster)->duty);
				if (bRest)
					continue;
				else
				{
					rest_before_roster->endInUtc = (*it_roster)->actStrUtc;
					break;
				}
			}
			else
			{
				rest_before_roster->startInUtc = (*it_roster)->actRestStrUtc;
			}
		}
	}
	else
		rest_before_roster->endInUtc = endUtc;
	if (startUtc <= rest_before_roster->endInUtc)
	{
		if ((rest_before_roster->endInUtc <= endUtc) && (restBase == "*" || rosters.size() == 0))
			rests.push_back(rest_before_roster);
		else if ((rest_before_roster->endInUtc <= endUtc) && rosters.size() > 0 && isInSameCity(rosters[0]->location , restBase))
			rests.push_back(rest_before_roster);
	}

	prev_roster = rosters.begin();

	for (it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
	{
		if ((*it_roster)->actStrUtc > endUtc)
			break;

		if ((*it_roster)->actEndUtc < startUtc)
		{
			prev_roster = it_roster;
			continue;
		}
		bool bRest = RuleParams::GetInstancePtr()->isRestAssignment((*it_roster)->qualifier, (*it_roster)->duty);
		if (bRest)
		{
			// mantis#4673, 因組員申請的差假上游系統沒有location, 因此外籍組員來台後申請病假其location會在home base, 實際上在TPE
			// 為了避免8015法規報錯, 將休息地點定義成上個roster的任務結束地點, 但上個roster距離太遠則沒有參考價值
			string restLocation = (*it_roster)->location;
			if ((*it_roster)->actStrUtc - (*prev_roster)->actRestStrUtc < 86400)
			{
				if ((*prev_roster)->pairing)
				{
					restLocation = (*prev_roster)->pairing->getEndArp();
				}
				else
				{
					restLocation = (*prev_roster)->location;
				}
			}
			if (restBase == "*" || isInSameCity(restBase, restLocation))
			{
				continue;
			}
		}

		if (bCoutLayover && (*it_roster)->pairing)
		{
			vector<Duty *> duties=(*it_roster)->pairing->getDutyVec();
			vector<Duty*>::iterator it_duty, prev_duty;
			prev_duty = duties.begin();
			for (it_duty = duties.begin(); it_duty != duties.end(); ++it_duty)
			{
				if (it_duty != duties.begin())
				{
					Rest_Ranges *rest_between_rosters = new Rest_Ranges();
					int debrief = (*prev_duty)->getActualDebriefMin();
					if (debrief < 0) debrief = 0;
					int dropoff = (*prev_duty)->getActualDropoffMin();
					if (dropoff < 0) dropoff = 0;
					rest_between_rosters->startInUtc = (*prev_duty)->getEndTimeUtcAct() + debrief * 60 + dropoff * 60;
					int brief = (*it_duty)->getActualBriefMin();
					if (brief < 0) brief = 0;
					int pickup = (*it_duty)->getActualPickupMin();
					if (pickup < 0) pickup = 0;
					rest_between_rosters->endInUtc = (*it_duty)->getStartTimeUtcAct() - brief * 60 - pickup * 60;
					if ( (rest_between_rosters->endInUtc <= endUtc) && (restBase=="*" || isInSameCity((*it_duty)->getDepStation(),restBase)))
						rests.push_back(rest_between_rosters);
				}

				prev_duty = it_duty;
			}
		}

		if (it_roster != rosters.begin())
		{
			Rest_Ranges *rest_between_rosters = new Rest_Ranges();
			rest_between_rosters->startInUtc = (*prev_roster)->actRestStrUtc;
			rest_between_rosters->endInUtc = (*it_roster)->actStrUtc;
			if ((rest_between_rosters->endInUtc <= endUtc) && (restBase == "*" || isInSameCity(restBase , (*it_roster)->location)))
				rests.push_back(rest_between_rosters);
		}
		prev_roster = it_roster;
	}

	//rest after last roster
	Rest_Ranges *rest_after_roster = new Rest_Ranges();
	rest_after_roster->endInUtc = endUtc;
	std::size_t i = rosters.size();
	if (i > 0)
	{
		rest_after_roster->startInUtc = rosters[i-1]->actEndUtc;
		if (rest_after_roster->startInUtc <= rest_after_roster->endInUtc &&
			(restBase == "*" || isInSameCity(restBase , rosters[i - 1]->location)))
			rests.push_back(rest_after_roster);
	}

	stable_sort(rests.begin(), rests.end(), rest_cmp);
	return rests;

}

vector<Rest_Ranges*> Utility::getRestRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, vector<string> restAssignments, bool bCoutLayover, string restBase)
{
	vector<Rest_Ranges*> rests;
	vector<SharedPtr<ROSTER>>::iterator it_roster, prev_roster;

	//rest before first roster
	Rest_Ranges* rest_before_roster = new Rest_Ranges();
	rest_before_roster->startInUtc = startUtc;
	if (rosters.size() > 0 && rosters[0]->actStrUtc < endUtc)
	{
		rest_before_roster->endInUtc = rosters[rosters.size() - 1]->actStrUtc;
		for (it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
		{
			string rosterRestBase = (*it_roster)->pairing ? (*it_roster)->pairing->getEndArp() : (*it_roster)->location;
			if (restBase == "*" || isInSameCity(restBase, rosterRestBase))
			{
				bool bRest = false;
				if (restAssignments.size() > 0 && restAssignments[0] != "*" && restAssignments[0] != "" && find(restAssignments.begin(), restAssignments.end(), (*it_roster)->qualifier) != restAssignments.end()) {
					bRest = true;
				}
				else {
					bRest = RuleParams::GetInstancePtr()->isRestAssignment((*it_roster)->qualifier, (*it_roster)->duty);
				}
				if (bRest)
					continue;
				else
				{
					rest_before_roster->endInUtc = (*it_roster)->actStrUtc;
					break;
				}
			}
			else
			{
				rest_before_roster->startInUtc = (*it_roster)->actRestStrUtc;
			}
		}
	}
	else
		rest_before_roster->endInUtc = endUtc;
	if (startUtc <= rest_before_roster->endInUtc)
	{
		if ((rest_before_roster->endInUtc <= endUtc) && (restBase == "*" || rosters.size() == 0))
			rests.push_back(rest_before_roster);
		else if ((rest_before_roster->endInUtc <= endUtc) && rosters.size() > 0 && isInSameCity(rosters[0]->location, restBase))
			rests.push_back(rest_before_roster);
	}

	prev_roster = rosters.begin();

	for (it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
	{
		if ((*it_roster)->actStrUtc > endUtc)
			break;

		if ((*it_roster)->actEndUtc < startUtc)
		{
			prev_roster = it_roster;
			continue;
		}
		bool bRest = false;
		if (restAssignments.size() > 0 && restAssignments[0] != "*" && restAssignments[0] != "" && find(restAssignments.begin(), restAssignments.end(), (*it_roster)->qualifier) != restAssignments.end()) {
			bRest = true;
		}
		else {
			bRest = RuleParams::GetInstancePtr()->isRestAssignment((*it_roster)->qualifier, (*it_roster)->duty);
		}
		if (bRest)
		{
			// mantis#4673, 因組員申請的差假上游系統沒有location, 因此外籍組員來台後申請病假其location會在home base, 實際上在TPE
			// 為了避免8015法規報錯, 將休息地點定義成上個roster的任務結束地點, 但上個roster距離太遠則沒有參考價值
			string restLocation = (*it_roster)->location;
			if ((*it_roster)->actStrUtc - (*prev_roster)->actRestStrUtc < 86400)
			{
				if ((*prev_roster)->pairing)
				{
					restLocation = (*prev_roster)->pairing->getEndArp();
				}
				else
				{
					restLocation = (*prev_roster)->location;
				}
			}
			if (restBase == "*" || isInSameCity(restBase, restLocation))
			{
				continue;
			}
		}

		if (bCoutLayover && (*it_roster)->pairing)
		{
			vector<Duty*> duties = (*it_roster)->pairing->getDutyVec();
			vector<Duty*>::iterator it_duty, prev_duty;
			prev_duty = duties.begin();
			for (it_duty = duties.begin(); it_duty != duties.end(); ++it_duty)
			{
				if (it_duty != duties.begin())
				{
					Rest_Ranges* rest_between_rosters = new Rest_Ranges();
					int debrief = (*prev_duty)->getActualDebriefMin();
					if (debrief < 0) debrief = 0;
					int dropoff = (*prev_duty)->getActualDropoffMin();
					if (dropoff < 0) dropoff = 0;
					rest_between_rosters->startInUtc = (*prev_duty)->getEndTimeUtcAct() + debrief * 60 + dropoff * 60;
					int brief = (*it_duty)->getActualBriefMin();
					if (brief < 0) brief = 0;
					int pickup = (*it_duty)->getActualPickupMin();
					if (pickup < 0) pickup = 0;
					rest_between_rosters->endInUtc = (*it_duty)->getStartTimeUtcAct() - brief * 60 - pickup * 60;
					if ((rest_between_rosters->endInUtc <= endUtc) && (restBase == "*" || isInSameCity((*it_duty)->getDepStation(), restBase)))
						rests.push_back(rest_between_rosters);
				}

				prev_duty = it_duty;
			}
		}

		if (it_roster != rosters.begin())
		{
			Rest_Ranges* rest_between_rosters = new Rest_Ranges();
			rest_between_rosters->startInUtc = (*prev_roster)->actRestStrUtc;
			rest_between_rosters->endInUtc = (*it_roster)->actStrUtc;
			if ((rest_between_rosters->endInUtc <= endUtc) && (restBase == "*" || isInSameCity(restBase, (*it_roster)->location)))
				rests.push_back(rest_between_rosters);
		}
		prev_roster = it_roster;
	}

	//rest after last roster
	Rest_Ranges* rest_after_roster = new Rest_Ranges();
	rest_after_roster->endInUtc = endUtc;
	std::size_t i = rosters.size();
	if (i > 0)
	{
		rest_after_roster->startInUtc = rosters[i - 1]->actEndUtc;
		if (rest_after_roster->startInUtc <= rest_after_roster->endInUtc &&
			(restBase == "*" || isInSameCity(restBase, rosters[i - 1]->location)))
			rests.push_back(rest_after_roster);
	}

	stable_sort(rests.begin(), rests.end(), rest_cmp);
	return rests;

}


vector<Rest_Ranges*> Utility::getWorkingRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, bool bCoutLayover, string restBase)
{
	vector<Rest_Ranges*> rests = getRestRanges(rosters, startUtc, endUtc, bCoutLayover, restBase);
	vector<Rest_Ranges*> works;
	for (std::size_t i = 0; i < rests.size(); i++)
	{
		time_t start=rests[i]->startInUtc, end=rests[i]->endInUtc;
		if (i == 0 && start > startUtc)
		{
			Rest_Ranges *work = new Rest_Ranges();
			work->startInUtc = startUtc;
			work->endInUtc = start;
			works.push_back(work);
		}
		if (i == rests.size() - 1 )
		{
			if (end < endUtc)
			{
				Rest_Ranges *work = new Rest_Ranges();
				work->startInUtc = end;
				work->endInUtc = endUtc;
				works.push_back(work);
			}
		}
		else
		{
			Rest_Ranges *work = new Rest_Ranges();
			work->startInUtc = end;
			work->endInUtc = rests[i+1]->startInUtc;
			works.push_back(work);
		}
	}

	return works;

}

bool Utility::isSouthNorathCommute(SharedPtr<CREW> crew,string strBase, SharedPtr<ROSTER> roster)
{
	bool bReturn = false;
	//包含南上北下的ROSTER，假设已经在PAIRING.PER_DIEM里已经计算
	if ((crew->airline=="BR") && (strBase == "TPE" || strBase == "TSA" || strBase == "KHH"))
	{

	}
	return bReturn;
}

/*
   check if two airports are in same city or ground transportation between two airports
*/
bool Utility::isInSameCity(string airport1, string airport2)
{
	bool bReturn = (airport1 == airport2);

	if (!bReturn)
	{
		if ((airport1 == "NRT" || airport1 == "HND") && (airport2 == "NRT" || airport2 == "HND"))
			bReturn = true;
		if ((airport1 == "TPE" || airport1 == "TSA") && (airport2 == "TPE" || airport2 == "TSA"))
			bReturn = true;
		if ((airport1 == "TPE" || airport1 == "KHH") && (airport2 == "TPE" || airport2 == "KHH"))
			bReturn = true;
		if ((airport1 == "TSA" || airport1 == "KHH") && (airport2 == "TSA" || airport2 == "KHH"))
			bReturn = true;
	}
	return bReturn;
}

/*
   check if two airports are in same base or ground transportation between two airports
   eva特有
*/
bool Utility::isInSameBase(string airport1, string airport2)
{
	bool bReturn = (airport1 == airport2);

	if (!bReturn)
	{
		if ((airport1 == "TPE" || airport1 == "TSA") && (airport2 == "TPE" || airport2 == "TSA"))
			bReturn = true;
	}
	return bReturn;
}

int Utility::DaysBetween(time_t date1, time_t date2, int offsetMinutes)
{

	double difference = 0;
	difference = difftime(date2, date1) / (60 * 60 * 24);

	///TEST
	double tmp1 = floor(difference);
	int tmp2 = (int)tmp1;
	int tmp3 = tmp2 + 1;
	///TEST
	int iReturn = (int(floor(difference)) + 1);
	if (getLocalDayStartInUTC(date1, offsetMinutes) == getLocalDayStartInUTC(date2, offsetMinutes))
		iReturn = 0;

	return  iReturn;
}


//读取rank表，然后根据rank判断是否为FD
bool Utility::isFD(vector<RANK> rankList,string rank){

	bool isFd = false;
	string division;
	//if (rank == "RFO" || rank == "FC" || rank == "RFC" || rank == "RFC")
	//	isFd = true;
	for (vector<RANK>::iterator iter = rankList.begin(); iter != rankList.end(); iter++){
		if ((*iter).rank == rank){
			division = (*iter).division;
			if (division == "P"){
				isFd = true;
				this->_airlinecode = (*iter).airline;
				break;
			}
		}
	}

	return isFd;
}

string Utility::getDutySegType(Duty* duty, vector<DBAirport> * airportList)
{
	string segType = "D";
	for (std::size_t i = 0; i < duty->getSegments().size(); i++){
		Segment* seg = duty->getSegment(i);
		string s = getSegType(airportList, seg->getDepStation(), seg->getArrStation());
		seg->setDomIntType(s);
		if (s == "I" && segType != "I"){
			segType = "I";
		}
		else if (s == "R" && segType != "I"&& segType != "R"){
			segType = "R";
		}
	}
	return segType;
}

string Utility::getSegType(vector<DBAirport> * airportList, string airport1,string airport2)
{
	string type1 = getAirportType(airportList, airport1);
	string type2 = getAirportType(airportList, airport2);
	if (type1 == "I" || type2 == "I")
	{
		return "I";
	}
	else if (type1 == "R" || type2 == "R")
		return "R";
	return "D";
}

string Utility::getAirportType(vector<DBAirport> * airportList, string airport)
{
	string airportType="D";
	for (vector<DBAirport>::iterator iter = airportList->begin(); iter != airportList->end(); ++iter){
		if ((*iter).airport == airport){
			//mantis0003561: PO 法规3010 国际航班duty brief 计算错误
			/*
			string strInbase = (*iter).isInternalBase;
			string strCross = (*iter).isCrossContinental;
			if (strInbase == "E" && strCross == "I")
				airportType = "I";
			else if (strInbase == "E" && strCross == "C")
				airportType = "R";
			else
				airportType = "D";
			break;
			*/
			string type = (*iter).dir;
			if (type != "R" && type != "I")
				type = "D";
			return type;
		}
	}
	
	return airportType;
}


//判断两个early duty是否连续
//假设两个duty已经和startLoc,endLoc有重合了，也就是已经调用过isTimesCoveredInRange方法

bool Utility::isTwoDutyConsecutives(Duty* prevDuty, Duty* currentDuty, int offsetMinutes, int startLoc, int endLoc)
{
	int iRet = true;
	if (prevDuty && currentDuty)
	{
		time_t startUtc = prevDuty->getStartTimeUtcAct();
		time_t dayStartUtc = this->getLocalDayStartInUTC(startUtc, offsetMinutes);
		/*
		if (startUtc > dayStartUtc + startLoc * 60)
		{
			startUtc = dayStartUtc + startLoc * 60 + 24 * 3600;
			endUtc = dayStartUtc + endLoc * 60 + 24 * 3600;
		}
		else
		{
			startUtc = dayStartUtc + startLoc * 60 ;
			endUtc = dayStartUtc + endLoc * 60;
		}
		startUtc = startUtc  + 24 * 3600;
		endUtc = endUtc  + 24 * 3600;*/

		//current duty
		time_t currStartUtc = currentDuty->getStartTimeUtcAct();
		time_t currEndUtc = currentDuty->getEndTimeUtcAct();
		/*
		if (currStartUtc <= startUtc && currEndUtc >= endUtc)
			iRet = true;
		else
			iRet = false;*/
		if (currStartUtc >= dayStartUtc + 24 * 3600 && currEndUtc <= dayStartUtc + 2 * 24 * 3600 + endLoc*60)
			iRet = true;
		else
			iRet = false;

	}
	return iRet;
}

bool Utility::isDownGrade(vector<RANK>& ranks, string airline,string activeRank, string actingRank)
{
	long long activeId=0, actingId=0;
	for (vector<RANK>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
	{
		if ((*rank).rank == activeRank && (*rank).airline == airline)
			activeId = (*rank).rankId;
		if ((*rank).rank == actingRank && (*rank).airline == airline)
			actingId = (*rank).rankId;
	}
	return (activeId < actingId);
}

string Utility::formatMinutesToDays(int minutes)
{
	int dd = minutes / (24 * 60);
	int hh = (minutes - dd * 24 * 60) / 60;
	int mm = (minutes - dd * 24 * 60) % 60;

	stringstream  ss;
	
	if (dd>0)
		ss << dd << "D:";

	if (hh < 10)
		ss << "0" << hh <<"H:";
	else
		ss << hh << "H:";
	
	if (mm < 10)
		ss << "0" << mm << "M";
	else
		ss << mm << "M";
	
	return ss.str();
}

string Utility::formatMinutes(int minutes)
{
	bool isNegative = minutes < 0;
	int minutes2 = std::abs(minutes);
	//mantis:0001259
	//int dd = minutes / (24 * 60);
	//int hh = (minutes-dd*24*60) / 60;
	int hh = (minutes2) / 60;
	int mm = (minutes2) % 60;

	stringstream  ss;
	if (isNegative) {
		ss << "-";
	}
	/*
	ss << dd << "D:";

	if (hh < 10)
		ss <<"0"<< hh;
	else
		ss << hh;
	if (mm < 10)
		ss << "H:0" << mm<<"M";
	else
		ss << "H:" << mm<<"M";
		*/
	ss << hh <<":";
	if (mm < 10)
		ss << "0";
	ss<< mm;
	return ss.str();
}


//mantis#1633, 针对8033修正，避免影响其他功能创建函数副本并在8033中调用
/*
bool Utility::isTimesCoveredInRange_fix(time_t startUtc, time_t endUtc, int hoursOffset, time_t startLoc, time_t endLoc)
{
	int iRet = true;

	time_t dayStartOfDutyBegin = getLocalDayStartInUTC(startUtc, hoursOffset);
	time_t dayStartOfDutyEnd = getLocalDayStartInUTC(endUtc, hoursOffset);
	
	//22-8
	if (startLoc > endLoc)
	{
		//mantis#1633, 前一天晚到后一天早判断逻辑开始时间应向前减少24小时
		if (startUtc > dayStartOfDutyBegin + endLoc * 60 && endUtc < dayStartOfDutyBegin + startLoc * 60 - 24 * 3600)
			return false;
	}
	//6-8
	else if (startLoc <= endLoc)
	{
		if (startUtc > dayStartOfDutyBegin + endLoc * 60 && endUtc < dayStartOfDutyBegin + 24 * 3600 + startLoc * 60)
			return false;
		if (startUtc > dayStartOfDutyBegin  && endUtc < dayStartOfDutyBegin + startLoc * 60)
			return false;
	}
	else
		iRet = false;

	return iRet;
}*/

bool Utility::isTimeCoveredInRange(time_t timeUtc, int offsetMinutes, time_t startLoc, time_t endLoc)
{
	int iRet = true;

	time_t dayStartOfDutyBegin = getLocalDayStartInUTC(timeUtc, offsetMinutes);

	//22-8
	if (startLoc > endLoc)
	{
		if (timeUtc > dayStartOfDutyBegin + endLoc * 60 && timeUtc < dayStartOfDutyBegin + startLoc * 60)
			return false;
	}
	//6-8
	else if (startLoc <= endLoc)
	{
		if (timeUtc > dayStartOfDutyBegin + endLoc * 60 && timeUtc < dayStartOfDutyBegin + 24 * 3600 + startLoc * 60)
			return false;
		if (timeUtc > dayStartOfDutyBegin  && timeUtc < dayStartOfDutyBegin + startLoc * 60)
			return false;
	}
	else
		iRet = false;

	return iRet;

}

//判断start,end时间范围是否覆盖了[startLoc,endLoc]
//startLoc,endLoc in minutes. startLoc=endLoc的情形为一个点，而不是区间。这也需要支持
//startLoc,endLoc都已经是分钟
bool Utility::isTimesCoveredInRange(time_t startUtc, time_t endUtc, int offsetMinutes, int startLoc, int endLoc)
{
	int iRet = true;

	time_t dayStartOfDutyBegin = getLocalDayStartInUTC(startUtc, offsetMinutes);
	time_t dayStartOfDutyEnd = getLocalDayStartInUTC(endUtc, offsetMinutes);

	//22-8
	if (startLoc > endLoc)
	{
		if (startUtc > dayStartOfDutyBegin + endLoc * 60 && endUtc < dayStartOfDutyBegin + startLoc * 60)
			return false;
	}
	//6-8
	else if (startLoc <= endLoc)
	{
		if (startUtc > dayStartOfDutyBegin + endLoc * 60 && endUtc < dayStartOfDutyBegin + 24 * 3600 + startLoc * 60)
			return false;
		if (startUtc > dayStartOfDutyBegin  && endUtc < dayStartOfDutyBegin + startLoc * 60)
			return false;
	}
	else
		iRet = false;

	return iRet;
}

//deprecated,the code used to be isTimesCoveredInRange
bool Utility::isTimesCoveredInRange2(time_t startUtc, time_t endUtc, int hoursOffset, int startLoc, int endLoc)
{
	int iRet = true;
	time_t tmTemp = startUtc;
	struct tm* tm_start = NULL;
	tm_start = gmtime((const time_t *)&tmTemp);
	if (tm_start->tm_hour + hoursOffset > 23){
		tm_start->tm_hour += hoursOffset - 24;
		tm_start->tm_mday += 1;
	}
	else
		tm_start->tm_hour += hoursOffset;

	int start_day = tm_start->tm_mday, start_hour = tm_start->tm_hour, start_min = tm_start->tm_min;

	tmTemp = endUtc;
	struct tm* tm_end = NULL;
	tm_end = gmtime((const time_t *)&tmTemp);
	if (tm_end->tm_hour + hoursOffset > 23){
		tm_end->tm_hour += hoursOffset - 24;
		tm_end->tm_mday += 1;
	}
	else
		tm_end->tm_hour += hoursOffset;
	int end_day = tm_end->tm_mday, end_hour = tm_end->tm_hour, end_min = tm_end->tm_min;

	if ((endUtc - startUtc) < (endLoc - startLoc) * 60 && endLoc>startLoc)
		iRet = false;
	else if (endUtc - startUtc >= (endLoc - startLoc) * 60 + 24 * 60 * 60)
		iRet = true;
	else if (start_day != end_day)
	{
		if ((start_hour * 60 + start_min <= startLoc) && (end_hour * 60 + end_min >= endLoc))
			iRet = true;
		else if ((start_hour * 60 + start_min > startLoc) && (end_hour * 60 + end_min >= endLoc))
		{
			iRet = true;
		}
		else if ((start_hour * 60 + start_min <= startLoc) && (end_hour * 60 + end_min < endLoc))
		{
			iRet = true;
		}
		else
		{
			iRet = false;
		}

	}
	else
	{
		if ((start_hour * 60 + start_min <= startLoc) && (end_hour * 60 + end_min >= endLoc))
			iRet = true;
		else
			iRet = false;
	}

	return iRet;
}


//strLower "12:00"
//strUpper "13:00"
//if true= strLower<=time<strUpper
//输入参数除time外都是机场本地时间，不是PEK，也不是UTC
// 检查本地时是否在小时分钟时间范围(inclusive)，可以传入 utc + offsetMinutes (本地时对应时区)；也可以传入本地时 + offsetMinutes = 0
// 例如：utc 1713146400 + offsetMinutes 480 (2024年4月15日早上10点00分 GMT+08:00)，strLower "10:00", strUpper "11:59"
// 返回true: 本地时为 1713175200 (1713146400+480*60) 本地时间为早上10点00分 GMT+08:00，在10:00和11:59之间
// 直接传入本地时 1713175200 (1713146400+480*60) 和 offsetMinutes = 0，返回同样结果
bool Utility::IsTimesInRange(time_t utctime,int minutesOffset,string strLower, string strUpper)
{
	time_t tmTime = utctime + minutesOffset * 60;
	struct tm* tm1 = gmtime(&tmTime);

	int iHoursLower, iMinutesLower, iHoursUpper, iMinutesUpper;

	getHHMMfromStr(strLower.c_str(), &iHoursLower, &iMinutesLower);
	getHHMMfromStr(strUpper.c_str(), &iHoursUpper, &iMinutesUpper);

	auto checkinMin = tm1->tm_hour * 60 + tm1->tm_min;
	auto checkinUpper = iHoursUpper * 60 + iMinutesUpper;
	auto checkinLower = iHoursLower * 60 + iMinutesLower;

	if (checkinUpper < checkinLower) { // 时间范围跨天
		return checkinMin >= checkinLower || checkinMin <= checkinUpper;
	}

	return checkinMin >= checkinLower && checkinMin <= checkinUpper;
	
	//return (tm1->tm_hour * 60 + tm1->tm_min >= iHoursLower * 60 + iMinutesLower) && (tm1->tm_hour * 60 + tm1->tm_min <= iHoursUpper * 60 + iMinutesUpper);
}


bool Utility::isTimeRangeContained(time_t startTime, time_t endTime, const std::string& targetStartTime, const std::string& targetEndTime) {
	if (startTime > endTime)
		return false;

	if (targetStartTime == "*" || targetEndTime == "*")
		return true;

	// 解析目标开始时间
	int targetStartHour = std::stoi(targetStartTime.substr(0, 2));
	int targetStartMinute = std::stoi(targetStartTime.substr(3, 2));

	// 解析目标结束时间
	int targetEndHour = std::stoi(targetEndTime.substr(0, 2));
	int targetEndMinute = std::stoi(targetEndTime.substr(3, 2));

	// 将目标时间转换为分钟数
	int targetStartTotalMinutes = targetStartHour * 60 + targetStartMinute;
	int targetEndTotalMinutes = targetEndHour * 60 + targetEndMinute;

	// 判断目标时间段是否跨天
	bool isCrossDay = targetEndTotalMinutes <= targetStartTotalMinutes;

	// 如果跨天，调整结束时间（加上一天的分钟数）
	if (isCrossDay) {
		targetEndTotalMinutes += 24 * 60; // 加上一天的分钟数
	}

	// 计算目标时间段的持续时间（分钟）
	int targetDuration = targetEndTotalMinutes - targetStartTotalMinutes;

	// 计算时间戳范围的总天数（考虑跨天情况）
	const int SECONDS_PER_DAY = 24 * 60 * 60;
	time_t duration = endTime - startTime;
	int totalDays = (int)(duration / SECONDS_PER_DAY) + 2; // 多算一天以处理跨天情况

	// 检查时间戳范围内的每一天
	for (int day = 0; day < totalDays; day++) {
		// 计算当前天的开始时间（当天的00:00:00）
		time_t currentDayStart = startTime + day * SECONDS_PER_DAY;

		time_t currentStartOfDay = Utility::getLocalDayStartInUTC(currentDayStart, 0);
		

		// 设置当前天的目标开始时间
		time_t currentTargetStart = currentStartOfDay + targetStartTotalMinutes * 60;

		// 设置目标结束时间（如果跨天，结束时间在第二天）
		int endDayOffset = isCrossDay ? 1 : 0;
		
		time_t currentTargetEnd = currentStartOfDay + endDayOffset * SECONDS_PER_DAY + targetEndTotalMinutes * 60;

		// 调整跨天情况的开始时间，确保它在查询时间范围内
		if (isCrossDay && currentTargetStart > endTime) {
			// 如果开始时间已经超出查询范围，使用前一天的开始时间
			
			time_t prevTargetStart = currentStartOfDay - SECONDS_PER_DAY + targetStartTotalMinutes * 60;

			// 检查前一天开始到当前天结束的时间段
			if (prevTargetStart >= startTime && currentTargetEnd <= endTime) {
				return true;
			}
		}
		else {
			// 正常情况：检查当前时间段是否完全包含在查询范围内
			if (currentTargetStart >= startTime && currentTargetEnd <= endTime) {
				return true;
			}
		}

		// 检查时间段是否部分包含在查询范围内（开始时间在查询开始之前，但结束时间在查询范围内）
		if (currentTargetStart < startTime && currentTargetEnd > startTime && currentTargetEnd <= endTime) {
			// 确保目标时间段在查询开始后的部分满足要求
			time_t actualStart = startTime;
			time_t actualEnd = currentTargetEnd;
			if (actualEnd - actualStart >= targetDuration * 60) { // 转换为秒数
				return true;
			}
		}

		// 检查时间段是否部分包含在查询范围内（结束时间在查询结束之后，但开始时间在查询范围内）
		if (currentTargetStart >= startTime && currentTargetStart < endTime && currentTargetEnd > endTime) {
			// 确保目标时间段在查询结束前的部分满足要求
			time_t actualStart = currentTargetStart;
			time_t actualEnd = endTime;
			if (actualEnd - actualStart >= targetDuration * 60) { // 转换为秒数
				return true;
			}
		}
	}

	return false;
}

bool Utility::isTimeOverlap(time_t startDateUTC1, time_t endDateUTC1, time_t startDateUTC2, time_t endDateUTC2)
{
	/*
	bool isOverlap = true;
	if (endDateUTC1<startDateUTC2 || startDateUTC1>endDateUTC2)
		isOverlap = false;
	return isOverlap;
	*/
	return (!(endDateUTC1<startDateUTC2 || startDateUTC1>endDateUTC2));
}

string Utility::getCrewPrimaryBase(vector<SharedPtr<CREW_BASE>>& bases, time_t startUtc)
{
	string retBase = "";
	for (auto& cb : bases)
	{
		time_t end = cb->expUtc;
		if (end < 0)
			end = time(NULL) + 365 * 24 * 60 * 60;
		if (cb->effUtc <= startUtc && end > startUtc && retBase == ""){
			retBase = cb->base;
		}
		if (cb->effUtc <= startUtc && end > startUtc && cb->isPrime) {
			retBase = cb->base;
			break;
		}
	}

	//20180125 ain, mantis#2768, 提高数据容错：若未找到目标时间，则寻找crew_base记录与目标时间最接近的
	if (retBase == "") {
		time_t minDiff = 10 * 365 * 24 * 3600;
		for (auto& cb : bases)
		{
			if (abs(cb->effUtc - startUtc) < minDiff) {
				retBase = cb->base;
				minDiff = abs(cb->effUtc - startUtc);
			}
			if (abs(cb->expUtc - startUtc) < minDiff) {
				retBase = cb->base;
				minDiff = abs(cb->effUtc - startUtc);
			}
		}
	}
	return retBase;
}

string Utility::getCrewPrimaryBaseByLoc(vector<SharedPtr<CREW_BASE>>& bases, time_t startLoc)
{
	string retBase = "";
	for (auto& cb : bases)
	{
		time_t end = cb->expLoc;
		if (end < 0)
			end = time(NULL) + 365 * 24 * 60 * 60;
		if (cb->effLoc <= startLoc && end > startLoc && retBase == "") {
			retBase = cb->base;
		}
		if (cb->effLoc <= startLoc && end > startLoc && cb->isPrime) {
			retBase = cb->base;
			break;
		}
	}

	//20180125 ain, mantis#2768, 提高数据容错：若未找到目标时间，则寻找crew_base记录与目标时间最接近的
	if (retBase == "") {
		time_t minDiff = 10 * 365 * 24 * 3600;
		for (auto& cb : bases)
		{
			if (abs(cb->effLoc - startLoc) < minDiff) {
				retBase = cb->base;
				minDiff = abs(cb->effLoc - startLoc);
			}
			if (abs(cb->expLoc - startLoc) < minDiff) {
				retBase = cb->base;
				minDiff = abs(cb->effLoc - startLoc);
			}
		}
	}
	return retBase;
}

string Utility::getCrewPrimaryBase(vector<SharedPtr<CREW_BASE>>& bases, time_t startUtc, time_t endUtc) {
	string retBase = "";
	for (auto& cb : bases)
	{
		if (cb->effUtc <= endUtc && cb->expUtc >= startUtc && retBase == "") {
			retBase = cb->base;
		}
		if (cb->effUtc <= endUtc && cb->expUtc >= startUtc && cb->isPrime) {
			retBase = cb->base;
			break;
		}
	}
	return retBase;
}

/*
根据起始结束日期，和定义，得到时间数值。
比如CM,2014-10-11,2015-02-01，得到的结果应该为10,11,12,1,2五个月的起始结束日期
日期都是UTC
*/
static map<string, map<time_t, time_t>> g_dateRangeCache;
static long long g_dateRangeCount = 0;
map<time_t, time_t>& Utility::getDateRangeFromLong(string strDefinition, string strNum, time_t startDateUTC, time_t endDateUTC, const string& weekdayStartFrom, int offsetMinutes)
{
	
	g_dateRangeCount++;
	//避免重复计算
	stringstream ss;
	ss << strDefinition << "::" << strNum << "::" << startDateUTC << "::" << endDateUTC << "::" <<offsetMinutes;
	string key = ss.str();
	if (g_dateRangeCache.find(key) != g_dateRangeCache.end()) {
		return g_dateRangeCache[key];
	}
	g_dateRangeCache[key] = map<time_t, time_t>();
	if (g_dateRangeCache.size() % 500 == 0) {
		cout << "DateRangeCache size=" << g_dateRangeCache.size() << " call-count=" << g_dateRangeCount << "\n";
	}

	//实际计算
	int iNum = stoi(strNum);
	string strMethod = strDefinition.substr(0, 1);
	string strUnit = strDefinition.substr(1, 1);
	//time_t tmTimeStart = startDateUTC;
	//time_t tmTimeEnd = endDateUTC;
	time_t tmTimeStart = this->getLocalDayStartInUTC(startDateUTC, offsetMinutes);
	time_t tmTimeEnd = this->getLocalDayStartInUTC(endDateUTC, offsetMinutes);

	if ((strMethod == "C" || strMethod == "R") && strUnit == "D")
	{
		tmTimeStart -= (iNum-1) * 24 * 3600;
		tmTimeEnd += (iNum-1) * 24 * 3600;
	}
	else if (strMethod == "C" && strUnit == "M")
	{
		tmTimeStart -= iNum * 30 * 24 * 3600;
	}

	map<time_t, time_t>& range = g_dateRangeCache[key];
	if (strMethod == "C" && strUnit == "Y"){	
		time_t t1 = this->getLocalYearEndInUTC(startDateUTC, offsetMinutes);
		range.insert(pair<time_t, time_t>(this->getLocalYearStartInUTC(startDateUTC, offsetMinutes), t1));
		for (int i = 0;; i++){
			time_t t2 = this->getLocalYearEndInUTC(t1 + 1, offsetMinutes);
			//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
			range.insert(pair<time_t, time_t>(t1 + 1, t2));
			if (t2 >= endDateUTC)
				break;
			t1 = t2;
		}
	}
	//if (strMethod == "C" && strUnit == "M"){
	//	time_t t1 = this->getLocalMonthEndInUTC(startDateUTC, offsetMinutes);
	//	range.insert(pair<time_t, time_t>(this->getLocalMonthStartInUTC(startDateUTC, offsetMinutes), t1));
	//	for (int i = 0; ; i++){
	//		time_t t2 = this->getLocalMonthEndInUTC(t1 + 1, offsetMinutes);
	//		//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
	//		range.insert(pair<time_t, time_t>(t1 + 1, t2));
	//		if (t2 >= endDateUTC)
	//			break;
	//		t1 = t2;
	//	}
	//}
	if ((strMethod == "C" || strMethod == "R") && strUnit == "M") {
		//map<time_t, time_t> range2 = this->getMonthRollingWindows(startDateUTC, endDateUTC, offsetMinutes, iNum);
		//时间先前滚动（从开始时间顺推），t1开始时间，t2结束时间
		time_t t1 = this->getLocalMonthStartInUTC(startDateUTC, offsetMinutes);
		for (int i = 0; ; i++) {
			time_t t2 = addMonths(t1, offsetMinutes, iNum) - 1;
			//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
			range.insert(pair<time_t, time_t>(t1, t2));
			if (t2 >= endDateUTC)
				break;
			t1 = addMonths(t1, offsetMinutes, 1);
		}
		
		//时间向后滚动（从结束时间倒推），t1开始时间，t2结束时间
		time_t t2 = this->getLocalMonthStartInUTC(endDateUTC, offsetMinutes);
		if (t2 != endDateUTC) {
			t2 = addMonths(t2, offsetMinutes, 1);
		}
		for (int i = 0; ; i++) {
			time_t t1 = addMonths(t2, offsetMinutes, -1*iNum);
			range.insert(pair<time_t, time_t>(t1, t2 - 1));

			t2 = addMonths(t2, offsetMinutes, -1);//先后滚动1个月
			if (t2 <= startDateUTC)
				break;
		}
	}
	//if (strMethod == "C" && strUnit == "W") {
	//	time_t t1 = this->getLocalWeekEndInUTC(startDateUTC, weekdayStartFrom, offsetMinutes) + (iNum - 1) * 7 * 24 * 60 * 60 ;
	//	range.insert(pair<time_t, time_t>(this->getLocalWeekStartInUTC(startDateUTC, weekdayStartFrom, offsetMinutes), t1));
	//	for (int i = 0; ; i++) {
	//		time_t t2 = this->getLocalWeekEndInUTC(t1 + 1, weekdayStartFrom, offsetMinutes) + (iNum - 1) * 7 * 24 * 60 * 60;
	//		//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
	//		range.insert(pair<time_t, time_t>(t1 + 1, t2));
	//		if (t2 >= endDateUTC)
	//			break;
	//		t1 = t2;
	//	}
	//}
	if ((strMethod == "C" || strMethod == "R") && strUnit == "W") {
		//map<time_t, time_t> range2 = this->getWeeksRollingWindows(startDateUTC, endDateUTC, weekdayStartFrom, offsetMinutes, iNum);
		time_t t1 = this->getLocalWeekStartInUTC(startDateUTC, weekdayStartFrom, offsetMinutes);
		for (int i = 0; ; i++) {
			time_t t2 = addWeeks(t1, iNum) - 1;
			//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
			range.insert(pair<time_t, time_t>(t1, t2));
			if (t2 >= endDateUTC)
				break;
			t1 = addWeeks(t1, 1);
		}
	}
	if ((strMethod == "C" || strMethod == "R") && strUnit == "D"){
		time_t t1 = tmTimeStart;
		for (int i = 0;; i++){
			time_t t2 = t1 + iNum * 86400 - 1;
			//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
			range.insert(pair<time_t, time_t>(t1, t2));
			if (t2 >= endDateUTC)
				break;
			t1 += 86400;
		}

	}

	if (strMethod == "R" && strUnit == "H") {
		tmTimeStart = getLocalHourStartInUTC(startDateUTC, offsetMinutes);
		time_t t1 = tmTimeStart;
		for (int i = 0;; i++) {
			time_t t2 = t1 + iNum * 3600 - 1;
			//20210311 ain, mantis#9189, 避免 CM/CY/CD/RD末尾段遗失
			range.insert(pair<time_t, time_t>(t1, t2));
			if (t2 >= endDateUTC)
				break;
			t1 += 3600;
		}
	}

	if (strMethod == "R" ){

	}

	return range;


}

/*按照first day of the yeear滚动week*/
map<time_t, time_t> Utility::getWeeksRollingWindowsByFirstDayOfYear(time_t windowStart, time_t windowEnd, int offsetMinutes, int times)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalYearStartInUTC(windowStart, offsetMinutes);
	
	while (tmTemp <= windowEnd)
	{
		if (isTimeOverlap(tmTemp, tmTemp + times * 7 * 24 * 3600, windowStart, windowEnd))
			ranges.insert(pair<time_t, time_t>(tmTemp, tmTemp + times * 7 * 24 * 3600));
		tmTemp = tmTemp + times * 7 * 24 * 3600;
	}

	return ranges;

}


/*按照Calendar Week滚动*/
map<time_t, time_t> Utility::getWeeksRollingWindows(time_t windowStart, time_t windowEnd, const string& weekdayStartFrom, int offsetMinutes, int times)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalWeekStartInUTC(windowStart, weekdayStartFrom, offsetMinutes);

	while (tmTemp <= windowEnd){
		ranges.insert(pair<time_t, time_t>(tmTemp, tmTemp + times * 7 * 24 * 3600));
		tmTemp = tmTemp + 7 * 24 * 3600;
	}

	return ranges;

}

/*按照Calendar Week滚动*/
map<time_t, time_t> Utility::getWeeksRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, const string& weekdayStartFrom, int offsetMinutes, int times, time_t refDate, bool isRolling)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalWeekStartInUTC(refDate, weekdayStartFrom, offsetMinutes);

	time_t windowStartDay = getLocalWeekStartInUTC(windowStart, weekdayStartFrom, offsetMinutes);

	while (tmTemp <= windowEnd) {
		time_t tmEnd = tmTemp + times * 7 * 24 * 3600;
		if (tmEnd > windowStartDay)
			ranges.insert(pair<time_t, time_t>(tmTemp, tmTemp + times * 7 * 24 * 3600));
		
		if (!isRolling)
			tmTemp = tmEnd;
		else
			tmTemp = tmTemp + 7 * 24 * 3600;
	}

	return ranges;

}

/*按照Calendar Day滚动*/
map<time_t, time_t> Utility::getDaysRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes, int times)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalDayStartInUTC(windowStart, offsetMinutes);
	
	while (tmTemp <= windowEnd){
		ranges.insert(pair<time_t, time_t>(tmTemp, tmTemp + times * 24 * 3600));
		tmTemp = tmTemp + 24 * 3600;
	}

	return ranges;
}

/*按照Calendar Day滚动*/
map<time_t, time_t> Utility::getDaysRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, int offsetMinutes, int times, time_t refDate, bool isRolling)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalDayStartInUTC(refDate, offsetMinutes);

	time_t windowStartDay = getLocalDayStartInUTC(windowStart, offsetMinutes);

	while (tmTemp <= windowEnd) {
		time_t tmEnd = tmTemp + times * 24 * 3600;
		if (tmEnd > windowStartDay)
			ranges.insert(pair<time_t, time_t>(tmTemp, tmEnd));

		if (!isRolling) {
			tmTemp = tmEnd;
		}
		else {
			tmTemp = tmTemp + 24 * 3600;
		}
	}

	return ranges;
}

//按照Calendar Quarter滚动
map<time_t, time_t> Utility::getQuarterRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes, int times)
{
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalQuarterStartInUtc(windowStart, offsetMinutes);

	while (tmTemp <= windowEnd) {
		time_t tmEnd = getLocalQuarterEndInUTC(tmTemp, offsetMinutes) + 1;
		ranges.insert(pair<time_t, time_t>(tmTemp, tmEnd));
		tmTemp = tmEnd + 1;
	}
	return ranges;
}


/*按照Calendar月滚动*/
map<time_t, time_t> Utility::getMonthRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes,int times)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalMonthStartInUTC(windowStart, offsetMinutes);

	while (tmTemp <= windowEnd){
		time_t tmEnd = getLocalMonthEndInUTC(tmTemp, offsetMinutes, times);// addMonths(tmTemp, times);
		ranges.insert(pair<time_t, time_t>(tmTemp, tmEnd));
		tmTemp = addMonths(tmTemp,offsetMinutes,1);
		//tmTemp = tmEnd + 1;
	}

	return ranges;
}

/*按照Calendar月滚动*/
map<time_t, time_t> Utility::getMonthRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, int offsetMinutes, int times, time_t refDate, bool isRolling)
{
	//假设window start/end都是本地时间
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalMonthStartInUTC(refDate, offsetMinutes);

	time_t windowStartDay = getLocalMonthStartInUTC(windowStart, offsetMinutes);

	while (tmTemp <= windowEnd) {
		time_t tmEnd = getLocalMonthEndInUTC(tmTemp, offsetMinutes, times);// addMonths(tmTemp, times);
		if (tmEnd > windowStartDay) 
			ranges.insert(pair<time_t, time_t>(tmTemp, tmEnd));
		//tmTemp = addMonths(tmTemp,1);
		
		tmTemp = tmEnd + 1;
	}

	return ranges;
}

//得到roster里，iMinutesWindow分钟的Rest window. 比如从roster取168小时window
//roster范围来做RosterEditor或者RosterOptimizer
map<time_t, time_t> Utility::getRollingWindows(int iMinutesRestWindow, time_t windowStart, time_t windowEnd, int rollingUnit)
{
	map<time_t, time_t> range;
	time_t tmTemp = windowStart;
	while (tmTemp + iMinutesRestWindow * 60 <= windowEnd){
		range.insert(pair<time_t, time_t>(tmTemp, tmTemp + iMinutesRestWindow * 60));
		tmTemp += rollingUnit;  //add one hour
	}

	return range;
}

int Utility::getFirstWorkingRosterIndex(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments)
{
	int iFirst = -1;

	std::size_t iSize = rosters.size();
	for (std::size_t index = 0; index < iSize; index++)
	{
		string roster_assignment = rosters[index]->duty;
		if (std::find(restAssignments.begin(), restAssignments.end(), roster_assignment) == restAssignments.end())
		{
			iFirst = (int)index;
			break;
		}
	}
	return iFirst;
}

int Utility::getLastWorkingRosterIndex(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments)
{
	int iLast = -1;
	int iSize = (int)rosters.size();
	for (int index = iSize-1; index >0; index--)
	{
		string roster_assignment = rosters[index]->duty;
		if (std::find(restAssignments.begin(), restAssignments.end(), roster_assignment) == restAssignments.end())
		{
			iLast = index;
			break;
		}
	}
	return iLast;
}

int Utility::getWorkingRosterIndexBefore(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments, int iCurrentIndex)
{
	int iNext = -1;
	int iSize = (int)rosters.size();
	if (iCurrentIndex ==0)
		return iNext;

	for (int index = iCurrentIndex-1; index >=0; --index)
	{
		string roster_assignment = rosters[index]->duty;
		if (std::find(restAssignments.begin(), restAssignments.end(), roster_assignment) == restAssignments.end())
		{
			iNext = index;
			break;
		}
	}

	return iNext;
}

//find next working roster, with roster.duty not in restAssignments
//return -1 for not found
int Utility::getNextWorkingRosterIndex(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments,int iCurrentIndex)
{
	int iNext = -1;
	int iSize = (int)rosters.size();
	if (iCurrentIndex+1 >= iSize)
		return iNext;

	for (int index = iCurrentIndex+1; index < iSize; ++index)
	{
		string roster_assignment = rosters[index]->duty;
		if (std::find(restAssignments.begin(), restAssignments.end(), roster_assignment) == restAssignments.end())
		{
			iNext = index;
			break;
		}
	}

	return iNext;
}

double Utility::howManyRostersInRange(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer, int roRosterIndex)
{
	double iReturn = 0.0;
	bool isAllPreassigned = true;
	bool isToBeAssignedRosterInList = false;
	int index = getFirstRoster(rosters, space, _dbData);
	if (index >= 0)
	{
		if (!(rosters[index]->actRestStrUtc < rangeStart || rosters[index]->actStrUtc > rangeEnd))
		{
			if ((rosters[index]->actRestStrUtc > rangeEnd && rosters[index]->actStrUtc < rangeEnd) ||
				(rosters[index]->actRestStrUtc > rangeStart && rosters[index]->actStrUtc < rangeStart))
				iReturn = iReturn + 0.5;
			else
				iReturn = iReturn + 1.0;
			isToBeAssignedRosterInList = (roRosterIndex == index);
			if (rosters[index]->source != "PA")
				isAllPreassigned = false;
		}
		while (index >= 0)
		{
			index = getNextRoster(rosters, index, space, _dbData);
			if (index >= 0 && rosters[index]->actRestStrUtc < rangeStart)
				continue;
			else if (index >= 0 && rosters[index]->actStrUtc > rangeEnd)
				break;
			else if (index != -1)
			{
				if ((rosters[index]->actRestStrUtc > rangeEnd && rosters[index]->actStrUtc < rangeEnd) ||
					(rosters[index]->actRestStrUtc > rangeStart && rosters[index]->actStrUtc < rangeStart))
					iReturn = iReturn + 0.5;
				else
					iReturn = iReturn + 1.0;
				if (rosters[index]->source != "PA")
					isAllPreassigned = false;
				if (!isToBeAssignedRosterInList && roRosterIndex>=0)
					isToBeAssignedRosterInList = (roRosterIndex == index);
			}
		}
	}
	if (isAllPreassigned && isOptimizer)
		iReturn = 0.0;
	if (!isToBeAssignedRosterInList && isOptimizer && roRosterIndex>=0)
		iReturn = 0.0;
	return iReturn;
}

/*
  统计在时间范围内，有多少个满足机场的飞行航班数量。
*/

double Utility::howManyRostersInRange2(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer, int roRosterIndex)
{
	double iReturn = 0.0;
	bool isAllPreassigned = true;
	bool isToBeAssignedRosterInList = false;

	vector<int> rosterIndexes = getMatchedRosters(rosters, space, _dbData);

	for (auto& index : rosterIndexes)
	{
		if ((rosters[index]->actRestStrUtc < rangeStart) || (rosters[index]->actStrUtc > rangeEnd))
			continue;

		if ((rosters[index]->actRestStrUtc > rangeEnd && rosters[index]->actStrUtc < rangeEnd) ||
			(rosters[index]->actRestStrUtc > rangeStart && rosters[index]->actStrUtc < rangeStart))
			iReturn = iReturn + 0.5;
		else
			iReturn = iReturn + 1.0;

		if (!isToBeAssignedRosterInList && roRosterIndex >= 0)
			isToBeAssignedRosterInList = (roRosterIndex == index);

		if (rosters[index]->source != "PA")
			isAllPreassigned = false;

	}
	//符合条件的Roster都是预占，并且属于优化调用，无需告警
	if (isAllPreassigned && isOptimizer)
		iReturn = 0.0;
	//优化调用，并当前即将分配Roster不符合条件，无需阻挡RO分配
	if (!isToBeAssignedRosterInList && isOptimizer && roRosterIndex >= 0)
		iReturn = 0.0;

	return iReturn;
}

double Utility::howManyDutiesInRange(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer, int roRosterIndex)
{
	double iReturn = 0.0;
	bool isAllPreassigned = true;
	bool isToBeAssignedRosterInList = false;

    map<size_t, vector<Duty*>> dutiesMap = getMatchedDuties(rosters, space, _dbData);//roster index到符合条件的duty列表的map

	for (auto& kv : dutiesMap)
	{
		size_t index = kv.first;
		vector<Duty*> duties = kv.second;
		for (auto& duty : duties)
		{
			if ((duty->getEndTimeUtcAct() < rangeStart) || (duty->getStartTimeUtcAct() > rangeEnd))
				continue;

			if ((duty->getEndTimeUtcAct() > rangeEnd && duty->getStartTimeUtcAct() < rangeEnd) ||
				(duty->getEndTimeUtcAct() > rangeStart && duty->getStartTimeUtcAct() < rangeStart))
				iReturn = iReturn + 0.5;
			else
				iReturn = iReturn + 1.0;

			if (!isToBeAssignedRosterInList && roRosterIndex >= 0)
				isToBeAssignedRosterInList = (roRosterIndex == index);

			if (rosters[index]->source != "PA")
				isAllPreassigned = false;

		}
	}
	//符合条件的Roster都是预占，并且属于优化调用，无需告警
	if (isAllPreassigned && isOptimizer)
		iReturn = 0.0;
	//优化调用，并当前即将分配Roster不符合条件，无需阻挡RO分配
	if (!isToBeAssignedRosterInList && isOptimizer && roRosterIndex >= 0)
		iReturn = 0.0;

	return iReturn;
}

/*
  统计在时间范围内，有多少个满足机场的飞行航班数量。[Deprecated,被howManyFlightMatchAirportInRange2替换]
*/
double howManyFlightMatchAirportInRange(SharedPtr<ROSTER> roster, vector<string> airports, time_t rangeStart, time_t rangeEnd)
{
	double dNum = 0;

	if (roster->duty == "FLY" && roster->pairing)
	{
		Pairing* pairing = roster->pairing;
		vector<Duty*> duties=pairing->getDutyVec();
		for (auto& duty : duties)
		{
			vector<Segment* > segments = duty->getSegments();
			for (auto& segment : segments)
			{
				if (segment->getAssignment() != "FLY")
					continue;

				string dep = segment->getDepSta();
				string arr = segment->getArrSta();

				vector<string>::iterator depFound = std::find(airports.begin(), airports.end(), dep);
				vector<string>::iterator arrFound = std::find(airports.begin(), airports.end(), arr);

				if ( (depFound != airports.end()) || (arrFound != airports.end()) )
				{ 
					if ((segment->getEndTimeUtcAct() > rangeEnd && segment->getStartTimeUtcAct() < rangeEnd) ||
						(segment->getEndTimeUtcAct() > rangeStart && segment->getStartTimeUtcAct() < rangeStart))
						dNum = dNum + 0.5;
					else
						dNum = dNum + 1.0;
				}
			}
		}
	}

	return dNum;
}

/*
  统计在时间范围内，有多少个满足条件的航班。
  任务最大频次法规，计算任务频次有两种模式：航班、任务环（目前功能：不管出现航班多次，作为任务环只算一次）。
  当法规参数设置机场时，在航班模式下统计飞行航班（置位除外）的频次，比如设置SVO，一个任务环包括：
	PEKSVO-SVOPEK（DHD）-LO-PEKSVO-SVOPEK，算1.5次；
	PEKSVO-SVOPEK-LO-PEKSVO-SVOPEK，算2次；
	PEKSVO-SVOPEK（DHD）-LO-PEKSVO（DHD）-SVOPEK，算1次；
	数航段数除以2（不取整数），加一个月度最大乘机次数控制规则（数任务环）
*/
double Utility::howManyFlightsInRange(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer, int roRosterIndex)
{
	double iReturn = 0.0;
	bool isAllPreassigned = true;
	bool isToBeAssignedRosterInList = false;
	int index = getFirstRoster(rosters, space, _dbData);
	
	if (index >= 0)
	{
		if (!(rosters[index]->actRestStrUtc < rangeStart || rosters[index]->actStrUtc > rangeEnd))
		{
			iReturn = iReturn + howManyFlightMatchAirportInRange(rosters[index], space->destinations, rangeStart, rangeEnd);
			isToBeAssignedRosterInList = (roRosterIndex == index);
			if (rosters[index]->source != "PA")
				isAllPreassigned = false;
		}
		while (index >= 0)
		{
			index = getNextRoster(rosters, index, space, _dbData);
			if (index >= 0 && rosters[index]->actRestStrUtc < rangeStart)
				continue;
			else if (index >= 0 && rosters[index]->actStrUtc > rangeEnd)
				break;
			else if (index != -1)
			{
				iReturn = iReturn + howManyFlightMatchAirportInRange(rosters[index], space->destinations, rangeStart, rangeEnd);
				if (rosters[index]->source != "PA")
					isAllPreassigned = false;
				if (!isToBeAssignedRosterInList && roRosterIndex >= 0)
					isToBeAssignedRosterInList = (roRosterIndex == index);
			}
		}
	}
	if (isAllPreassigned && isOptimizer)
		iReturn = 0.0;
	if (!isToBeAssignedRosterInList && isOptimizer && roRosterIndex >= 0)
		iReturn = 0.0;
	iReturn = iReturn / 2;
	return iReturn;
}

// 参数解释 duty的pairingDutyNode集合  DUTY/SEGMENT  PICKUP/BRIEF/DEBRIEF/DROPOFF TosegmentId
shared_ptr<PairingDutyNode> Utility::getPairingDutyNode(
	vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes, string type, string node, long long segmentId){
	shared_ptr<PairingDutyNode> pairingDutyNode = NULL;
	int id = 99999;
	for (auto pdn : pairingDutyNodes){
		if (pdn->getType() == type && pdn->getNode() == node && pdn->getSequence() < id){
			if (segmentId == 0){
				id = pdn->getSequence();
				pairingDutyNode = pdn;
			}
			if (segmentId != 0 && pdn->getToSegmentId() == segmentId){
				id = pdn->getSequence();
				pairingDutyNode = pdn;
			}

		}
	}
	return pairingDutyNode;
}

shared_ptr<PairingDutyNode> Utility::getPairingDutyNodeOfSeg(const vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes, const string node, const long long fromSegmentId, const long long toSegmentId) {
	shared_ptr<PairingDutyNode> pairingDutyNode = nullptr;

	for (auto& pdn : pairingDutyNodes) {
		if (pdn->getType() == "SEGMENT" && pdn->getNode() == node) {
			if (fromSegmentId != 0 && toSegmentId != 0
				&& pdn->getFromSegmentId() == fromSegmentId && pdn->getToSegmentId() == toSegmentId) {
				pairingDutyNode = pdn;
				break;
			}

		}
	}
	return pairingDutyNode;
}

bool Utility::findBeforeFdpSeg(int i, Duty*& duty, CrewDataContext* dbData){
	vector<Segment*> Segments = duty->getSegments();
	for (; i >= 0; i--){
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment != dbData->assignmentNameMap.end() && segAssignment->second->FDP_PCT > 0){
			return true;
		}
	}
	return true;
}
bool Utility::findAfterFdpSeg(int i, Duty*& duty, CrewDataContext* dbData){
	vector<Segment*> Segments = duty->getSegments();
	for (; i < (int)Segments.size(); i++){
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment != dbData->assignmentNameMap.end() && segAssignment->second->FDP_PCT > 0){
			return true;
		}
	}
	return false;
}
/*
  暂时的逻辑为，如果Blank Day不算Days off，那么post Duty rest也不算days off
  isSplit=True, 连续DO,根据iConsecutive拆分，否则仅仅算一个DO。
  例如：iConsecutive=2，有个联系4天的DO
	   isSplit=True, DO数量=2
	   isSplit=False, DO数量=1
*/
int Utility::howManyAssignmentsInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string>& assignments, vector<string>& assignmentGroups, time_t rangeStart, time_t rangeEnd, int iConsecutive,bool isSplit)
{
	int iDaysOff = 0;
	bool bCountPostRest = false;
	std::size_t iSize = rosters.size();
	time_t start, end,next_end;
	if (isSplit)
	{
		for (std::size_t i = 0; i < iSize; i += iConsecutive)
		{
			if (bCountPostRest)
				end = rosters[i]->actRestStrUtc;
			else
				end = rosters[i]->actEndUtc;
			start = rosters[i]->actStrUtc;
			if (!(start >= rangeStart && end <= rangeEnd))
				continue;
			if (matchAssignmentInRoster(rosters[i], assignments, assignmentGroups))
			{
				if (iConsecutive > 1)
				{
					bool bFind = false;
					for (int j = 0; j < iConsecutive; j++)
					{
						if (!bFind)
						{
							if (bCountPostRest)
								end = rosters[i + j + 1]->actRestStrUtc;
							else
								end = rosters[i + j + 1]->actEndUtc;
							start = rosters[i + j + 1]->actStrUtc;
							if (!(start >= rangeStart && end <= rangeEnd))
							{
								bFind = true;
								continue;
							}
							if (matchAssignmentInRoster(rosters[i + j + 1], assignments, assignmentGroups))
							{
								bFind = true;
							}

						}
					}
					if (!bFind)
						iDaysOff++;
				}
				else
					iDaysOff++;
			}
		}
	}
	else
	{
		int i=0, j;
		while (i < (int)iSize)
		{
			if (bCountPostRest)
				end = rosters[i]->actRestStrUtc;
			else
				end = rosters[i]->actEndUtc;
			start = rosters[i]->actStrUtc;
			if (!(start >= rangeStart && end <= rangeEnd))
			{
				i++;
				continue;
			}
			if (matchAssignmentInRoster(rosters[i], assignments, assignmentGroups))
			{
				for (j = i + 1; j < (int)iSize; j++)
				{
					if (bCountPostRest)
						next_end = rosters[j]->actRestStrUtc;
					else
						next_end = rosters[j]->actEndUtc;
					
					if (next_end > rangeEnd)
					{
						j--;
						break;
					}
					//判断下一个roster的assignment和assignmentGroup
					if (!matchAssignmentInRoster(rosters[j], assignments, assignmentGroups))
						break;

				}
				if (j - i >= iConsecutive)
				{
					iDaysOff++;
					i = j + 1;
				}
				else
					i++;
			}
			else
				i++;
		}
	}
	return iDaysOff;
}

int Utility::howManyAssignmentsInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string>& assignments, time_t rangeStart, time_t rangeEnd, int iConsecutive, bool isSplit)
{
	vector<string> assignmentGroups;
	return howManyAssignmentsInRange(rosters, assignments, assignmentGroups, rangeStart, rangeEnd, iConsecutive, isSplit);
}

int Utility::howManyDaysOffInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string> restAssignments, vector<string> daysOffs, int offsetMinutes, bool bCountPostRest, time_t rangeStart, time_t rangeEnd,int iConsecutive)
{
	int iDaysOff = 0;
	time_t start, end;
	vector<SharedPtr<ROSTER>> rostersTemp;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		start = (*roster)->actStrUtc;
		end = (*roster)->actRestStrUtc;
		if ((start > rangeStart && start <= rangeEnd) || (end > rangeStart && end <= rangeEnd))
			rostersTemp.push_back((*roster));

	}

	int iSize = (int)rostersTemp.size();
	int iFirst = getFirstWorkingRosterIndex(rostersTemp, restAssignments);
	if (iSize == 0 || iFirst == -1)
	{
		int iNumberOfLocalDays = static_cast<int>(floor((rangeEnd - rangeStart) / (iConsecutive * 24 * 3600)));
		if (iNumberOfLocalDays < 0)
			iNumberOfLocalDays = 0;
		iDaysOff += iNumberOfLocalDays;
		return iDaysOff;
	}
	start = rostersTemp[iFirst]->actStrUtc;
	if (rangeStart < start)
	{
		time_t restStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rangeStart, offsetMinutes);
		if (restStart < rangeStart)
			restStart = restStart + 24 * 3600;
		int iNumberOfLocalDays = static_cast<int>(floor((start - restStart) / (iConsecutive * 24 * 3600)));
		if (iNumberOfLocalDays < 0)
			iNumberOfLocalDays = 0;
		iDaysOff += iNumberOfLocalDays;
	}
	int iLast = getLastWorkingRosterIndex(rostersTemp, restAssignments);
	if (iLast == -1 && iSize == 1)
		iLast = 0;
	else if (iLast == -1)
		return iDaysOff;
	if (bCountPostRest)
		end = rostersTemp[iLast]->actRestStrUtc;
	else
		end = rostersTemp[iLast]->actEndUtc;
	if (rangeEnd > end)
	{
		time_t restStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes);
		if (restStart < end)
			restStart = restStart + 24 * 3600;
		int iNumberOfLocalDays = static_cast<int>(floor((rangeEnd - restStart) / (iConsecutive * 24 * 3600)));
		if (iNumberOfLocalDays < 0)
			iNumberOfLocalDays = 0;
		iDaysOff += iNumberOfLocalDays;
	}
	int iNextIndex = 0,iCurrent=iFirst;
	while (iNextIndex!=-1)
	{
		iNextIndex = getNextWorkingRosterIndex(rostersTemp, restAssignments, iCurrent);
		if (iNextIndex == -1)
			break;
		if (bCountPostRest)
			start = rostersTemp[iCurrent]->actRestStrUtc;
		else
			start = rostersTemp[iCurrent]->actEndUtc;
		time_t restStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes);
		if (restStart < start)
			restStart = restStart + 24 * 3600;
		end = rostersTemp[iNextIndex]->actStrUtc;
		int iNumberOfLocalDays = static_cast<int>(floor((end - restStart) / (iConsecutive * 24 * 3600)));
		if (iNumberOfLocalDays < 0)
			iNumberOfLocalDays = 0;
		iDaysOff += iNumberOfLocalDays;

		iCurrent = iNextIndex;
	}
	return iDaysOff;
}

/*
根据起始结束日期，和定义，得到时间数值。
比如CM,2014-10-11,2015-02-01，得到的结果应该为10,11,12,1,2五个月的起始结束日期
日期都是UTC
*/
map<time_t, time_t>& Utility::getDateRange(string strDefinition, string strNum, string startDateUTC, string endDateUTC, const string& weekdayStartFrom){

	time_t lStart = this->UTCStrToUTC(const_cast<char *>(startDateUTC.c_str()));
	time_t lEnd = this->UTCStrToUTC(const_cast<char *>(endDateUTC.c_str()));
	map<time_t, time_t>& range = getDateRangeFromLong(strDefinition, strNum, lStart, lEnd, weekdayStartFrom);
	return range;
}



string Utility::getComplement(map<string, int> compMap){
	map <string, int>::iterator m1_Iter;
	int i = 0; string strComplement="2P";
	for (m1_Iter = compMap.begin(); m1_Iter != compMap.end(); m1_Iter++){
		string rank = m1_Iter->first;
		int iValue = m1_Iter->second;
		if (rank == "CAP" || rank == "RCAP" || rank == "FO" || rank == "RFO" || rank == "SO")
			i += iValue;
	}
	if (i == 2) strComplement = "2P";
	if (i == 3) strComplement = "3P";
	if (i >= 4) strComplement = "4P";
	return strComplement;

}

time_t Utility::UTCStrToUTC(char * buf){
	tm   m;
	time_t t = 0;
	int  i = 0;
	int  beg = 0;
	int  end = 0;
	int  len = (int)strlen(buf);
	char dt[6][5] = { 0 };
	int  dtIndex = 0;
	int  year = 0;
	int  mon = 0;
	int  date = 0;
	int  HH = 0;
	int  mm = 0;
	int  ss = 0;

	//解析字符串到 yyyy, MM, dd
	while (i < len) {
		while (!isDigit(buf[i]) && i < len)
			i++;
		if (i >= len)
			break;
		beg = i;

		while (isDigit(buf[i]) && i < len)
			i++;
		end = i;

		strncpy(dt[dtIndex], &buf[beg], end - beg);

		i++;
		dtIndex++;
		if (dtIndex >= 6)
			break;
	}

	//从year mon date值获取utc time_t值
	year = atoi(dt[0]);
	mon = atoi(dt[1]);
	date = atoi(dt[2]);
	HH = atoi(dt[3]);
	mm = atoi(dt[4]);
	ss = atoi(dt[5]);
	m.tm_year = year - 1900;
	m.tm_mon = mon - 1;
	m.tm_mday = date;
	m.tm_hour = HH;
	m.tm_min = mm;
	m.tm_sec = ss;
	m.tm_isdst = 0;
	t = mktime(&m);

	//计算offset，将mktime结果修正为utc
	tm lm = { 0 };
	tm gm = { 0 };
	time_t lt = 0;
	time_t gt = 0;
#ifdef _WIN32
	errno_t err0 = _localtime32_s(&lm, (__time32_t *)&t);
	errno_t err1 = _gmtime32_s(&gm, (__time32_t *)&t);
#else
	localtime_r(&t, &lm);
	gmtime_r(&t, &gm);
#endif
	lt = mktime(&lm);
	gt = mktime(&gm);
	time_t offset = lt - gt;
	return t + offset;

};


void Utility::UTCToUTCStr(time_t utc, char * buf, int bufsize)
{ 
	utcToUtcStr(utc, buf, bufsize); 
};

// 检查Crew在时间范围内是否有有效的资质qual
bool Utility::isCrewHasQual(SharedPtr<CREW>& crew, string qual, time_t startDate, time_t endDate, string assignment, const multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigsForQualMap, bool isRankSpecific)
{

	if (qual.size() == 0 || qual == "*")
		return true;
	bool hasQual = false;
	time_t eff, exp;
	vector<SharedPtr<CREW_QUALIFICATION>> quals = crew->qualificationList;
	int extensionTime = 0;
	string extensionUnit;

	auto posQual = qualExtensionConfigsForQualMap.equal_range(qual);
	if (posQual.first != posQual.second)
	{
		auto& activityConfig = posQual.first->second;
		Activity* activity = std::get<0>(activityConfig);
		auto& config = std::get<1>(activityConfig);

		extensionTime = config->extensionTime;
		extensionUnit = config->extensionUnit;
	}

	for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator it = quals.begin(); it != quals.end(); ++it){

		if ((*it)->qual == qual){
			eff = (*it)->issuedUtc;
			exp = (*it)->expiryUtc;

			if (extensionTime != 0) {
				if (extensionUnit == "CD")
					exp += extensionTime * (3600 * 24);
				else if (extensionUnit == "CW")
					exp += extensionTime * 7 * (3600 * 24);
				else if (extensionUnit == "CM")
					exp = addMonths(exp, extensionTime);
			}
			if (((*it)->status == "V" || (*it)->status == "F" || (*it)->status == "T" || (*it)->status == "A")
				&& (eff <= startDate && (exp >= endDate || exp == -1)))
			{
				if (!isRankSpecific)
				{
					hasQual = true;
					break;
				}
				else
				{
					//需要和Crew的Rank进行对比
					//To Do
				}
			}
		}
	}

	return hasQual;
}

bool Utility::isPureAssignmentInRoster(SharedPtr<ROSTER> roster, vector<string> assignments)
{
	bool bReturn = false;
	if (!(roster->pairing))
	{
		if (find(assignments.begin(), assignments.end(), roster->duty) != assignments.end())
			bReturn = true;
	}
	else
	{
		bool hasOtherAssignment = false;
		vector<Duty *> duties=roster->pairing->getDutyVec();
		//for (vector<Duty *>::iterator duty = duties.begin();)
	}

	return bReturn;
}

bool Utility::matchAssignmentInRoster(const SharedPtr<ROSTER>& roster, const vector<string>& assignments, const vector<string>& assignmentGroups) {
	bool matched = false;
	if ((assignments.empty() || find(assignments.begin(), assignments.end(), roster->qualifier) != assignments.end()) 
		&& (assignmentGroups.empty() || find(assignmentGroups.begin(), assignmentGroups.end(), roster->duty) != assignmentGroups.end())) {
		matched = true;
	}
	return matched;
}

//bCountPostRest=true, consider the pairing last post rest to count days Off
//bCountBlankDays=true, consider the blank days to count days off
//Assumption: bCountBlankDays=false && bCountPostRest=true, doesn't exist
//			  if bCountBlankDays=true, bCountPostRest can be true or false
//			  if bCountBlankDays=false, bCountPostRest must be false
//iConsecutive
//base if it is NOT Null, the DO should be taken at base
//isSplit if false, Consecutive days off will be counted as one DO: For instance, 4 Consecutive DO (iConsecutive=2),
//															isSplit=True, the number of DO=2, else, the number of DO=1 as isSplit=false
//return the number of consecutive days off rather than the number of days off which meet the consecutive condition.
/*weekEnd ：
N - N / A
F - Fully Weekend including Sat and Sunday(CONSECUTIVE DAYS >= 2）
P - Partial Weekend including Sat or Sunday, must have one of Sat and Sun.
*/

int Utility::howManyDaysOffInRanges(const vector<SharedPtr<ROSTER>>& rosters, const vector<string>& doAssignments, const vector<string>& doAssignmentGroups, const time_t rangeStart, const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays, const bool bCountPostRest, const map<string, DBAirport*>& airportMap, const string layoverTimemode, const int iConsecutive, const bool bCountLayover, const string base, const bool isSplit, const string weekEnd)
{
	if (iConsecutive < 1)
		return 0;

	//iConsecutive = 1;
	int iBlankDays = 0;

	//if (!bCountBlankDays)
	//	return 0;

	vector<Rest_Ranges*> rests;
	vector<SharedPtr<ROSTER>>::iterator it_roster, prev_roster;

	//get first Non-DO and last Non-DO roster
	int rosterSize = (int)rosters.size();
	int iFirstNonDOIndex = -1, iLastNonDOIndex = -1;

	if (bCountBlankDays)
	{
		if (rosterSize > 0)
		{
			for (int i = 0; i < rosterSize; ++i)
			{
				if (matchAssignmentInRoster(rosters[i], doAssignments, doAssignmentGroups))
					continue;
				else
				{
					iFirstNonDOIndex = i;
					if ((bCountPostRest && rosters[i]->actRestStrUtc >= rangeStart) || (!bCountPostRest && rosters[i]->actEndUtc >= rangeStart))
					{
						break;
					}
				}
			}

			for (int i = rosterSize - 1; i >= 0; --i)
			{
				if (matchAssignmentInRoster(rosters[i], doAssignments, doAssignmentGroups))
					continue;
				else
				{
					iLastNonDOIndex = i;
					if (rosters[i]->actStrUtc <= rangeEnd)
					{
						break;
					}
				}
			}
		}

		if ((iFirstNonDOIndex < 0 && iLastNonDOIndex >= 0) || (iFirstNonDOIndex >= 0 && iLastNonDOIndex < 0))
			Logger::getRuleLogger()->error("howManyDaysOffInRanges:Assert Error in DO Index.");
		if (iFirstNonDOIndex == -1 || iLastNonDOIndex == -1)
		{
			Rest_Ranges *rest_before_roster = new Rest_Ranges();
			rest_before_roster->startInUtc = rangeStart;
			rest_before_roster->endInUtc = rangeEnd;
			rests.push_back(rest_before_roster);
		}
		else
		{
			if (rosters[iFirstNonDOIndex]->actStrUtc > rangeStart)
			{
				Rest_Ranges *rest_before_roster = new Rest_Ranges();
				rest_before_roster->startInUtc = rangeStart;
				rest_before_roster->endInUtc = rosters[iFirstNonDOIndex]->actStrUtc;
				rest_before_roster->airport = rosters[iFirstNonDOIndex]->location;
				/*if (base == "" || (base != "" && isInSameCity(base,rosters[iFirstNonDOIndex]->location)))
					rests.push_back(rest_before_roster);*/
				// 20190423 mantis#3643, Count Blank Day時location和base不須一致, 只要是空白天都列計DO
				rests.push_back(rest_before_roster);
			}

			if ((rangeEnd > rosters[iLastNonDOIndex]->actRestStrUtc && bCountPostRest) || (rangeEnd > rosters[iLastNonDOIndex]->actEndUtc && !bCountPostRest))
			{
				Rest_Ranges *rest_before_roster1 = new Rest_Ranges();
				if (bCountPostRest)
					rest_before_roster1->startInUtc = rosters[iLastNonDOIndex]->actRestStrUtc;
				else
					rest_before_roster1->startInUtc = rosters[iLastNonDOIndex]->actEndUtc;
				rest_before_roster1->endInUtc = rangeEnd;
				rest_before_roster1->airport = rosters[iLastNonDOIndex]->location;
				/*if (base == "" || (base != "" && isInSameCity(base, rosters[iLastNonDOIndex]->location)))
					rests.push_back(rest_before_roster1);
				else if (rosters[iLastNonDOIndex]->pairing)
				{
					string arrStation = rosters[iLastNonDOIndex]->pairing->getLastSegment()->getArrStation();
					if (isInSameCity(arrStation,base))
						rests.push_back(rest_before_roster1);
				}*/
				// 20190423 mantis#3643, Count Blank Day時location和base不須一致, 只要是空白天都列計DO
				rests.push_back(rest_before_roster1);
			}
		}
		if (iFirstNonDOIndex != iLastNonDOIndex && iFirstNonDOIndex != -1 && iLastNonDOIndex != -1)
		{
			int iPrevRoster = iFirstNonDOIndex;
			for (int i = iFirstNonDOIndex + 1; i <= iLastNonDOIndex; ++i)
			{
				if (rosters[i]->actRestStrUtc<rangeStart || rosters[i]->actStrUtc>rangeEnd)
					continue;
				if (matchAssignmentInRoster(rosters[i], doAssignments, doAssignmentGroups))
				{
					continue;
				}
				else
				{
					if (rosters[i]->actStrUtc - rosters[iPrevRoster]->actRestStrUtc >= (24 * 3600 - 1) * iConsecutive)
					{
						Rest_Ranges *rest_before_roster = new Rest_Ranges();
						if (bCountPostRest)
							rest_before_roster->startInUtc = rosters[iPrevRoster]->actRestStrUtc;
						else
							rest_before_roster->startInUtc = rosters[iPrevRoster]->actEndUtc;

						rest_before_roster->endInUtc = rosters[i]->actStrUtc;
						rest_before_roster->airport = rosters[i]->pairing ? rosters[i]->pairing->getEndArp() : rosters[i]->location;
						//0002779: 8023 BKK组员原先DO符合8天，月末指派BKKAMS后，DO变为3天
						/*if (base == "" || (base != "" && isInSameCity(base,rosters[i]->location)))
							rests.push_back(rest_before_roster);
						else
						{
							// mantis#4923, 地理不連續時已分配給組員的DO仍應計算在內
							long dayStart, dayEnd;
							for (int j = 0; j < rosterSize; ++j)
							{
								if (rosters[j]->actStrUtc < rest_before_roster->startInUtc)
								{
									continue;
								}
								else if (rosters[j]->actStrUtc > rest_before_roster->endInUtc)
								{
									break;
								}

								if (find(doAssignments.begin(), doAssignments.end(), rosters[j]->duty) != doAssignments.end()
									&& ((base != "" && isInSameCity(base, rosters[j]->location)) || (base == "")))
								{
									dayStart = this->GetInstancePtr()->getLocalDayStartInUTC(rosters[j]->actStrUtc, offset);
									dayEnd = this->GetInstancePtr()->getLocalDayStartInUTC(rosters[j]->actRestStrUtc + 60, offset);
									if (dayEnd < dayStart)
										dayEnd = dayStart;
									int iDays = (dayEnd - dayStart) / (24 * 3600 * iConsecutive);
									if (iDays > 0) {
										if (isSplit)
											iBlankDays += iDays;
										else
											iBlankDays++;
									}
								}
							}
						}*/
						// 20190423 mantis#3643, Count Blank Day時location和base不須一致, 只要是空白天都列計DO
						rests.push_back(rest_before_roster);
					}
					iPrevRoster = i;
				}
			}
		}
		//add layover
		time_t dutyEnd, dutyStart;
		if (bCountLayover)
		{
			int iStart = iFirstNonDOIndex - 1, iEnd = iLastNonDOIndex + 1;

			iStart = max(0, iStart);
			iEnd = min(iEnd, (int)rosters.size() - 1);
			for (int i = iStart; i <= iEnd; ++i)
			{
				if (rosters[i]->pairing)
				{
					vector<Duty *> duties = rosters[i]->pairing->getDutyVec();

					//layover 没有单独duty对象
					for (int l = 0; l + 1 < (int)duties.size(); ++l)
					{
						dutyEnd = duties[l]->getEndTimeUtcAct();
						dutyStart = duties[l + 1]->getStartTimeUtcAct();
						if (dutyStart - dutyEnd >= (24 * 3600 - 1)*iConsecutive)
						{
							if (dutyEnd<rangeEnd && dutyStart>rangeStart)
							{
								Rest_Ranges *layover = new Rest_Ranges();
								layover->startInUtc = max(rangeStart, dutyEnd);
								layover->endInUtc = min(rangeEnd, dutyStart);
								layover->airport = duties[l]->getArrStation();
								//if (base == "" || (base != "" && isInSameCity(base, duties[l + 1]->getDepStation())))
									rests.push_back(layover);
							}
						}
					}
				}
			}
		}

		stable_sort(rests.begin(), rests.end(), rest_cmp);

		for (vector<Rest_Ranges*>::iterator rest = rests.begin(); rest != rests.end(); ++rest)
		{
			int localOffsetMinutes = offsetMinutes;
			auto iterAirport = airportMap.find((*rest)->airport);
			if (layoverTimemode.size() > 0 && layoverTimemode != "" && layoverTimemode == "LOCAL TIME" && iterAirport != airportMap.end()) {
				localOffsetMinutes = TimezoneUtils::GetTimezoneOffset((*rest)->startInUtc, iterAirport->second->zoneId);
			}
				
			time_t dayStart = this->GetInstancePtr()->getLocalDayStartInUTC((*rest)->startInUtc, localOffsetMinutes);
			if (dayStart != (*rest)->startInUtc)
				dayStart += 24 * 3600;
			// 任务结束在00:00，算已经侵占当天
			if (dayStart == (*rest)->startInUtc && dayStart != rangeStart)
				dayStart += 24 * 3600;
			time_t dayEnd = this->GetInstancePtr()->getLocalDayStartInUTC((*rest)->endInUtc + 1, localOffsetMinutes);
			if (dayEnd <= dayStart)
				dayEnd = dayStart;
			int ii = static_cast<int>(dayEnd - dayStart) / (24 * 3600 * iConsecutive);
			if (ii > 0) 
			{
				if (weekEnd=="F" || weekEnd=="P")
				{ 
					int iWeekEnd = this->GetInstancePtr()->hasWeekEndInRange((*rest)->startInUtc, (*rest)->endInUtc, localOffsetMinutes, weekEnd);
					if (isSplit)
						iBlankDays += iWeekEnd;
					else
					{
						if (iWeekEnd>0)
							iBlankDays += iWeekEnd;
					}
				}
				else
				{
					if (isSplit)
						iBlankDays += ii;
					else
						iBlankDays++;
				}
			}
		}
	}
	else // else of 'if (bCountBlankDays)'
	{
		//若不计算blankDay
		//1 遍历找 DO, 作为 iFirstDOIndex
		//2 找到 DO后，查看连续DO结束位置，作为 iLastDOIndex
		//  判断连续DO按：
		//  a) 是否相邻DO
		//    按 roster[i].duty是否属于 doAssignments
		//  b) 是否日期连续
		//    iGap = (rosters[i]->actStrLoc - rosters[iFirstDOIndex]->actStrLoc) / (1.0 * 24 * 3600 * (i - iFirstDOIndex))
		//    if (iGap > 1.0) 则找到连续DO末尾
		//3 连续DO计算天数并累加
		//4 从连续DO结束开始找下一个DO, 循环1-3
		int iFirstDOIndex = -1, iLastDOIndex=-1;
		time_t startTime, EndTime;
		for (int i = 0; i < rosterSize; ++i)
		{
			if (!(isTimeOverlap(rangeStart, rangeEnd, rosters[i]->actStrUtc, rosters[i]->actRestStrUtc)))
				continue;

			int gapDaysBtw = 1;
			if (i > 0)
			{
				gapDaysBtw = static_cast<int>(rosters[i]->actStrLoc - rosters[i - 1]->actStrLoc) / (24 * 3600);
			}

			if (matchAssignmentInRoster(rosters[i], doAssignments, doAssignmentGroups)
				&& ((base != "" && isInSameCity(base, rosters[i]->location)) || (base == "")))
			{
				if (iFirstDOIndex < 0)
					iFirstDOIndex = i;
				else
				{
					//20190128 ain, mantis#4905, 判断连续DO, iGap计算过程需按浮点数，分母增加浮点数转换 '1.0 *'
					double iGap = (rosters[i]->actStrLoc - rosters[iFirstDOIndex]->actStrLoc) / (1.0 * 24 * 3600 * (i - iFirstDOIndex));
					if (iGap > 1.0)
					{
						startTime = rosters[iFirstDOIndex]->actStrUtc;
						if (iLastDOIndex < 0)
							iLastDOIndex = iFirstDOIndex;
						EndTime = rosters[iLastDOIndex]->actEndUtc + 60;
						int ii = static_cast<int>(EndTime - startTime) / (24 * 3600 * iConsecutive);
						if (ii > 0) {
							if (isSplit)
								iBlankDays += ii;
							else
								iBlankDays++;
						}
						iFirstDOIndex = i;
						iLastDOIndex = -1;
					}
					else
						iLastDOIndex = i;
				}
			}
			else
			{
				if (iFirstDOIndex >= 0)
				{
					startTime = rosters[iFirstDOIndex]->actStrUtc;
					if (iLastDOIndex < 0)
						iLastDOIndex = iFirstDOIndex;
					EndTime = rosters[iLastDOIndex]->actEndUtc + 60;
					int ii = static_cast<int>(EndTime - startTime) / (24 * 3600 * iConsecutive);
					if (ii > 0) 
					{
						if (weekEnd == "F" || weekEnd == "P")
						{
							int iWeekEnd = this->GetInstancePtr()->hasWeekEndInRange(startTime, EndTime, offsetMinutes, weekEnd);
							if (isSplit)
								iBlankDays += iWeekEnd;
							else
							{
								if (iWeekEnd > 0)
									iBlankDays++;
							}
						}
						else
						{
							if (isSplit)
								iBlankDays += ii;
							else
								iBlankDays++;
						}
					}

				}

				iFirstDOIndex = -1, iLastDOIndex = -1;
			}
		}
		//last
		if (iFirstDOIndex >= 0)
		{
			startTime = rosters[iFirstDOIndex]->actStrUtc;
			if (iLastDOIndex < 0)
				iLastDOIndex = iFirstDOIndex;
			EndTime = rosters[iLastDOIndex]->actEndUtc + 60;
			int ii = static_cast<int>(EndTime - startTime) / (24 * 3600 * iConsecutive);
			if (ii > 0) 
			{
				if (weekEnd == "F" || weekEnd == "P")
				{
					int iWeekEnd = this->GetInstancePtr()->hasWeekEndInRange(startTime, EndTime, offsetMinutes, weekEnd);
					if (isSplit)
						iBlankDays += iWeekEnd;
					else
					{
						if (iWeekEnd > 0)
							iBlankDays++;
					}
				}
				else
				{
					if (isSplit)
						iBlankDays += ii;
					else
						iBlankDays++;
				}

			}
		}

	}

	for (auto& it : rests) {
		delete it;
	}
	rests.clear();

	return (iBlankDays);
}


int Utility::howManyDaysOffInRanges(const vector<SharedPtr<ROSTER>>& rosters, const vector<string>& doAssignments, const time_t rangeStart, const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays, const bool bCountPostRest, const map<string, DBAirport*>& airportMap, const string layoverTimemode, const int iConsecutive, const bool bCountLayover, const string base, const bool isSplit, const string weekEnd) {
	vector<string> doAssignmentGroups;
	return howManyDaysOffInRanges(rosters, doAssignments, doAssignmentGroups, rangeStart, rangeEnd, offsetMinutes, bCountBlankDays, bCountPostRest, airportMap, layoverTimemode, iConsecutive, bCountLayover, base, isSplit, weekEnd);
}
/*
   在时间范围内，是否部分或全部周末天
*/
int Utility::hasWeekEndInRange(time_t utcStart, time_t utcEnd, int offsetMinutes, string weekEndMode) {

	bool ret = false;

	if (weekEndMode == "N" || weekEndMode == "")
		return true;

	time_t localStart=getLocalDayStartInUTC(utcStart, offsetMinutes);
	if (localStart < utcStart)
		localStart += 24 * 60 * 60;
	time_t localEnd= getLocalDayStartInUTC(utcEnd, offsetMinutes);

	if (localEnd > utcEnd)
		localEnd -= 24 * 60 * 60;

	int iDays = static_cast<int>(localEnd - localStart) / (24 * 60 * 60);

	bool hasSat = false, hasSun = false;
	int iPrevSat = -2;
	int howManyWeekend = 0;
	for (int i = 0; i < iDays; i++)
	{
		time_t times = localStart + (24 * 3600) * i + offsetMinutes * 60;
		tm * tt = gmtime(&times);
		int weekDay = tt->tm_wday;
		if (weekDay == 0)
		{
			hasSun = true;
			//Sat & Sun has to be consecutive two days
			if (weekEndMode == "F")
			{
				if (i - iPrevSat != 1)
				{
					hasSun = false;
					hasSat = false;
				}
			}
		}
		else if (weekDay == 6)
		{
			hasSat = true;
			iPrevSat = i;
		}

		if (weekEndMode == "P")
		{
			if (hasSat || hasSun)
			{
				howManyWeekend++;
				hasSat = false;
				hasSun = false;
			}
		}
		else if (weekEndMode == "F")
		{
			if (hasSat && hasSun)
			{
				howManyWeekend++;
				hasSat = false;
				hasSun = false;
			}
		}
	}

	return howManyWeekend;
}


string Utility::getAirlineCode() { return _airlinecode; }



int Utility::isDigit(char ch) {
	if (ch >= '0' && ch <= '9')
		return 1;  //true
	else
		return 0;  //false
}

int Utility::getFirstAttributeRoster(vector<SharedPtr<ROSTER>>& roster, string strAtt){
	int rosterIndex = FAILURE;
	int rostersize = (int)roster.size();

	vector<string> attributes;
	split(strAtt, '|', attributes);

	for (int ii = 0; ii < rostersize; ++ii) {
		if (!roster[ii]->pairing)
			continue;
		string attribute = roster[ii]->pairing->getAttribute();
		
		bool bFound = false;
		/*
		0010413: 2个欧洲任务之间没有设置间隔，误告警.
		问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
		for (auto singleAttribute : attributes)
		{
			if (attribute.find(singleAttribute) != strAtt.npos)
			{
				bFound = true;
				break;
			}
		}
		*/
		bFound = this->isPairingMatchAttributes(attribute, attributes);

		//if ((attribute.find(strAtt) != strAtt.npos) &&
		if (bFound	&&	(rosterIndex == FAILURE))
		{
			rosterIndex = ii;
			break;
		}
	}
	return rosterIndex;
}

//判断当前roster是否和scenario的downrank情形一致
bool Utility::isDownRankInScenario(string crewActiveRank, string crewActingRank, vector<string>& scenarioActiveRanks, vector<string>& scenarioActingRanks, string rankCross)
{
	bool isMatch = false;

	if (!rankCross.empty() && (std::find(scenarioActiveRanks.begin(), scenarioActiveRanks.end(), crewActiveRank) != scenarioActiveRanks.end()
		|| scenarioActiveRanks[0] == "*")
		&& (std::find(scenarioActingRanks.begin(), scenarioActingRanks.end(), crewActingRank) != scenarioActingRanks.end()
			|| scenarioActingRanks[0] == "*"))
		isMatch = true;

	return isMatch;
}

bool Utility::isMatchRosterSpace(Pairing* pairing, roster_space* space)
{
	if (space->assignments.size() <= 0 ||
		space->qualifiers.size() <= 0 ||
		space->labels.size() <= 0 ||
		space->attributes.size() <= 0 )

	{
		Logger::getRuleLogger()->info("space size=0");
		//return rosterIndex;
	}
	if (!pairing)
		return false;

	string pgAttribute, assignment, label, qualifier;
	string strAtt = space->attributes[0], strLabel = space->labels[0], strAssingment = space->assignments[0], strQualifier = space->qualifiers[0], strDest = "*";
	if (space->destinations.size()>0)
		strDest = space->destinations[0];

	string strFlts = "*";
	if (space->flightNumbers.size() > 0)
		strFlts = space->flightNumbers[0];

	bool isAttribute = false, isAssignment = false, isLabel = false, isBase = true, isQualifier = false, isDest = false, isFlight = false;

	if ((!pairing) && (strAtt != "*" || strLabel != "*"))
		return false;

	//if (space->isRequested == "Y" && !(rosters[ii]->isRequested))
	//	continue;
	//if (space->isRequested == "N" && (rosters[ii]->isRequested))
	//	continue;

	pgAttribute =pairing->getAttribute();
	label = pairing->getLabel();

	//assignment = rosters[ii]->duty;
	assignment = pairing->getPrimeActivity();

	if (strAtt == "*")
		isAttribute = true;
	else
	{
		/*
		0010413: 2个欧洲任务之间没有设置间隔，误告警.
		问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
		for (vector<string>::iterator single = space->attributes.begin(); single != space->attributes.end(); ++single)
		{
			if (attribute.find((*single)) != string::npos)
			{
				isAttribute = true;
				break;
			}
		}
		*/
		isAttribute = this->isPairingMatchAttributes(pgAttribute, space->attributes);
	}

	if (strAssingment == "*" || std::find(space->assignments.begin(), space->assignments.end(), assignment) != space->assignments.end())
		isAssignment = true;

	if (strLabel == "*")
		isLabel = true;
	else
	{
		for (vector<string>::iterator it = space->labels.begin(); it != space->labels.end(); ++it)
		{
			if (label.find((*it)) != string::npos)
			{
				isLabel = true;
				break;
			}
		}
	}

	if ((space->strLocationSameTOBase == "Y" && space->crewBase != pairing->getBase()) ||
		(space->strLocationSameTOBase == "N" && space->crewBase == pairing->getBase()))
		isBase = false;

	qualifier = pairing->getQualifier();
	if (strQualifier == "*" || std::find(space->qualifiers.begin(), space->qualifiers.end(), qualifier) != space->qualifiers.end())
		isQualifier = true;

	if (strDest != "*")
	{
		if (pairing)
		{
			for (std::size_t di = 0; di < pairing->getNumDuties(); di++) {
				Duty * d = pairing->getDuty(di);
				for (std::size_t si = 0; si < d->getNumSegments(); si++) {
					Segment * segment = d->getSegment(si);
					if (std::find(space->destinations.begin(), space->destinations.end(), segment->getArrStation()) != space->destinations.end())
					{
						isDest = true;
						break;
					}
				}
			}
		}
	}
	else
		isDest = true;

	bool isAirport = false;
	if (space->strAirports != "*")
	{
		if (pairing)
		{
			for (std::size_t di = 0; di < pairing->getNumDuties(); di++) {
				Duty * d = pairing->getDuty(di);
				for (std::size_t si = 0; si < d->getNumSegments(); si++) {
					Segment * segment = d->getSegment(si);
					if (std::find(space->airports.begin(), space->airports.end(), segment->getArrStation()) != space->airports.end())
					{
						isAirport = true;
						break;
					}
					if (std::find(space->airports.begin(), space->airports.end(), segment->getDepStation()) != space->airports.end())
					{
						isAirport = true;
						break;
					}
				}
			}
		}
	}
	else
		isAirport = true;

	if (strFlts != "*")
	{
		if (pairing)
		{
			for (std::size_t di = 0; di < pairing->getNumDuties(); di++) {
				Duty * d = pairing->getDuty(di);
				for (std::size_t si = 0; si < d->getNumSegments(); si++) {
					Segment * segment = d->getSegment(si);
					if (std::find(space->flightNumbers.begin(), space->flightNumbers.end(), segment->getFlightNumber()) != space->flightNumbers.end())
					{
						isFlight = true;
						break;
					}
				}
			}
		}
	}
	else
		isFlight = true;

	if (isFlight && isAttribute && isAssignment && isLabel && isBase && isQualifier && isDest && isAirport)
	{
		return true;
	}
	return false;
}

//一次获取符合全部条件的RosterList，返回Roster Index的List
vector<int> Utility::getMatchedRosters(const vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData)
{
	vector<int> rosterIndexes;

	int rostersize = (int)rosters.size();

	if (space->assignments.size() <= 0 ||
		space->qualifiers.size() <= 0 ||
		space->labels.size() <= 0 ||
		space->attributes.size() <= 0)

	{
		Logger::getRuleLogger()->info("space size=0");
	}

	string attribute, assignment, label, qualifier;
	string strAtt = space->attributes[0], strLabel = space->labels[0], strAssingment = space->assignments[0], strQualifier = space->qualifiers[0], strDest = "*";

	string strFlts = "*";
	if (space->flightNumbers.size() > 0)
		strFlts = space->flightNumbers[0];

	string strRole = "*";
	if (space->roles.size() > 0)
		strRole = space->roles[0];
	if (space->destinations.size() > 0)
		strDest = space->destinations[0];

	for (int ii = 0; ii < rostersize; ++ii)
	{
		bool isAttribute = false, isAssignment = false, isLabel = false, isBase = true;
		bool isQualifier = false, isDest = false, isRole = false, isFlight = false;
		bool isAirport = false;

		if (space->isRequested == "Y" && !(rosters[ii]->isRequested))
			continue;
		if (space->isRequested == "N" && (rosters[ii]->isRequested))
			continue;

		if (rosters[ii]->pairing)
		{
			attribute = rosters[ii]->pairing->getAttribute();
			label = rosters[ii]->label;
		}
		else {
			attribute = rosters[ii]->attribute;
		}
		assignment = rosters[ii]->qualifier;

		if (strRole == "*" || std::find(space->roles.begin(), space->roles.end(), rosters[ii]->role) != space->roles.end())
			isRole = true;

		if (strAtt == "*")
			isAttribute = true;
		else
		{
			if (this->isPairingMatchAttributes(attribute, space->attributes))
			{
				isAttribute = true;
			}
		}

		if (strAssingment == "*" || std::find(space->assignments.begin(), space->assignments.end(), assignment) != space->assignments.end())
			isAssignment = true;
		if (!isAssignment)
			for (auto assignmentGroup : space->assignments) {
				if (_dbData->isAssignmentInGroup(assignment, assignmentGroup)) {
					isAssignment = true;
					break;
				}
			}

		/*if (strLabel == "*")
			isLabel = true;
		else
		{
			for (vector<string>::iterator it = space->labels.begin(); it != space->labels.end(); ++it)
			{
				if (label.find((*it)) != string::npos)
				{
					isLabel = true;
					break;
				}
			}
		}*/
		if (strLabel == "*" || std::find(space->labels.begin(), space->labels.end(), rosters[ii]->label) != space->labels.end())
			isLabel = true;

		if (space->strLocationSameTOBase != "*")
			if ((space->strLocationSameTOBase == "Y" && space->crewBase != rosters[ii]->location) ||
				(space->strLocationSameTOBase == "N" && space->crewBase == rosters[ii]->location))
				isBase = false;

		qualifier = rosters[ii]->qualifier;
		if (strQualifier == "*" || std::find(space->qualifiers.begin(), space->qualifiers.end(), qualifier) != space->qualifiers.end())
			isQualifier = true;

		if (strDest != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->destinations.begin(), space->destinations.end(), segment->getArrStation()) != space->destinations.end())
						{
							isDest = true;
							break;
						}
					}
				}
			}
		}
		else
			isDest = true;

		if (strFlts != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->flightNumbers.begin(), space->flightNumbers.end(), segment->getFlightNumber()) != space->flightNumbers.end())
						{
							isFlight = true;
							break;
						}
					}
				}
			}
		}
		else
			isFlight = true;

		isAirport = false;
		if (space->strAirports != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->airports.begin(), space->airports.end(), segment->getArrStation()) != space->airports.end())
						{
							isAirport = true;
							break;
						}
						if (std::find(space->airports.begin(), space->airports.end(), segment->getDepStation()) != space->airports.end())
						{
							isAirport = true;
							break;
						}
					}
				}
			}
		}
		else
			isAirport = true;

		bool isOverrideDutyAttribute = false;
		if (!space->overrideDutyAttributes.empty())
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty* d = rosters[ii]->pairing->getDuty(di);
					if (d != nullptr) {
						if (this->isDutyMatchAttributes(d->getAttributes(), space->overrideDutyAttributes))
						{
							isOverrideDutyAttribute = true;
							break;
						}
					}
				}
			}
		}
		else {
			isOverrideDutyAttribute = true;
		}

		bool isLineTraining = false;
		if (space->isLineTraining != "*") {
			isLineTraining = (space->isLineTraining == "Y") == isTrainingFlight(rosters[ii], _dbData);
		}
		else {
			isLineTraining = true;
		}

		bool isCourseCode = false;
		if (!space->courseCodes.empty()) {
			isCourseCode = MatchCourse(rosters[ii], space->courseCodes, _dbData);
		}
		else {
			isCourseCode = true;
		}

		if (isFlight && isAttribute && isAssignment && isLabel && isBase && isQualifier && isDest
			&& isRole && isAirport && isLineTraining && isCourseCode && isOverrideDutyAttribute)
		{
			rosterIndexes.push_back(ii);
		}
	}

	return rosterIndexes;
}

map<size_t, vector<Duty*>> Utility::getMatchedDuties(const vector<SharedPtr<ROSTER>>& rosters, roster_space* space, const SharedPtr<CrewDataContext>& _dbData) {
    map<size_t, vector<Duty*>> resultDutiesMap;//roster index -> matched duties

	int rostersize = (int)rosters.size();

	if (space->assignments.size() <= 0 ||
		space->qualifiers.size() <= 0 ||
		space->labels.size() <= 0 ||
		space->attributes.size() <= 0)

	{
		Logger::getRuleLogger()->info("space size=0");
	}

	string attribute, assignment, label, qualifier;
	string strAtt = space->attributes[0], strLabel = space->labels[0], strAssingment = space->assignments[0], strQualifier = space->qualifiers[0], strDest = "*";

	string strFlts = "*";
	if (space->flightNumbers.size() > 0)
		strFlts = space->flightNumbers[0];

	string strRole = "*";
	if (space->roles.size() > 0)
		strRole = space->roles[0];
	if (space->destinations.size() > 0)
		strDest = space->destinations[0];

	for (int ii = 0; ii < rostersize; ++ii)
	{
		bool isAttribute = false, isAssignment = false, isLabel = false, isBase = true;
		bool isQualifier = false, isDest = false, isRole = false, isFlight = false;
		bool isAirport = false;

		if (rosters[ii]->pairing == nullptr)
			continue;

		if (space->isRequested == "Y" && !(rosters[ii]->isRequested))
			continue;
		if (space->isRequested == "N" && (rosters[ii]->isRequested))
			continue;

		attribute = rosters[ii]->pairing->getAttribute();
		label = rosters[ii]->label;

		assignment = rosters[ii]->duty;

		if (strRole == "*" || std::find(space->roles.begin(), space->roles.end(), rosters[ii]->role) != space->roles.end())
			isRole = true;

		if (strAtt == "*")
			isAttribute = true;
		else
		{
			if (this->isPairingMatchAttributes(attribute, space->attributes))
			{
				isAttribute = true;
			}
		}

		if (strAssingment == "*" || std::find(space->assignments.begin(), space->assignments.end(), assignment) != space->assignments.end())
			isAssignment = true;
		
		if (!isAssignment) {
			for (auto assignmentGroup : space->assignments) {
				if (_dbData->isAssignmentInGroup(assignment, assignmentGroup)) {
					isAssignment = true;
					break;
				}
			}
		}

		if (strLabel == "*" || std::find(space->labels.begin(), space->labels.end(), rosters[ii]->label) != space->labels.end())
			isLabel = true;

		if (space->strLocationSameTOBase != "*")
			if ((space->strLocationSameTOBase == "Y" && space->crewBase != rosters[ii]->location) ||
				(space->strLocationSameTOBase == "N" && space->crewBase == rosters[ii]->location))
				isBase = false;

		qualifier = rosters[ii]->qualifier;
		if (strQualifier == "*" || std::find(space->qualifiers.begin(), space->qualifiers.end(), qualifier) != space->qualifiers.end())
			isQualifier = true;

		bool isLineTraining = false;
		if (space->isLineTraining != "*") {
			isLineTraining = (space->isLineTraining == "Y") == isTrainingFlight(rosters[ii], _dbData);
		}
		else {
			isLineTraining = true;
		}

		for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
			Duty* d = rosters[ii]->pairing->getDuty(di);

			if (strDest != "*")
			{
				for (std::size_t si = 0; si < d->getNumSegments(); si++) {
					Segment* segment = d->getSegment(si);
					if (std::find(space->destinations.begin(), space->destinations.end(), segment->getArrStation()) != space->destinations.end())
					{
						isDest = true;
						break;
					}
				}
			}
			else
				isDest = true;

			if (strFlts != "*")
			{
				for (std::size_t si = 0; si < d->getNumSegments(); si++) {
					Segment* segment = d->getSegment(si);
					if (std::find(space->flightNumbers.begin(), space->flightNumbers.end(), segment->getFlightNumber()) != space->flightNumbers.end())
					{
						isFlight = true;
						break;
					}
				}
			}
			else
				isFlight = true;

			isAirport = false;
			if (space->strAirports != "*")
			{
				for (std::size_t si = 0; si < d->getNumSegments(); si++) {
					Segment* segment = d->getSegment(si);
					if (std::find(space->airports.begin(), space->airports.end(), segment->getArrStation()) != space->airports.end())
					{
						isAirport = true;
						break;
					}
					if (std::find(space->airports.begin(), space->airports.end(), segment->getDepStation()) != space->airports.end())
					{
						isAirport = true;
						break;
					}
				}
			}
			else
				isAirport = true;

			bool isOverrideDutyAttribute = false;
			if (!space->overrideDutyAttributes.empty())
			{
				if (this->isDutyMatchAttributes(d->getAttributes(), space->overrideDutyAttributes))
				{
					isOverrideDutyAttribute = true;
				}
			}
			else {
				isOverrideDutyAttribute = true;
			}

			if (isFlight && isAttribute && isAssignment && isLabel && isBase && isQualifier && isDest
				&& isRole && isAirport && isLineTraining && isOverrideDutyAttribute)
			{
				resultDutiesMap[ii].emplace_back(d);
			}
		}
	}
	return resultDutiesMap;
}

int Utility::getFirstRoster(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData)
{
	int rosterIndex = FAILURE;
	int rostersize = (int)rosters.size();

	if (space->assignments.size() <= 0 ||
		space->qualifiers.size() <= 0 ||
		space->labels.size() <= 0 ||
		space->attributes.size() <= 0 )

	{
		Logger::getRuleLogger()->info("space size=0");
		//return rosterIndex;
	}

	string attribute, assignment, label, qualifier;
	string strAtt = space->attributes[0], strLabel = space->labels[0], strAssingment = space->assignments[0], strQualifier = space->qualifiers[0], strDest = "*";
	
	string strFlts = "*";
	if (space->flightNumbers.size() > 0)
		strFlts = space->flightNumbers[0];

	string strRole = "*";
	if (space->roles.size()>0)
		strRole=space->roles[0];
	if (space->destinations.size()>0)
		strDest = space->destinations[0];
	bool isAttribute = false, isAssignment = false, isLabel = false, isBase = true, isQualifier = false, isDest=false, isRole=false,isFlight=false;
	bool isAirport = false;

	for (int ii = 0; ii < rostersize; ++ii)
	{
		isAttribute = false, isAssignment = false, isLabel = false, isBase = true, isQualifier = false, isDest = false, isRole = false;

		if ((!rosters[ii]->pairing) && (strAtt != "*" || strLabel != "*"))
			continue;

		if (space->isRequested == "Y" && !(rosters[ii]->isRequested))
			continue;
		if (space->isRequested == "N" && (rosters[ii]->isRequested))
			continue;

		if (rosters[ii]->pairing)
		{
			attribute = rosters[ii]->pairing->getAttribute();
			label = rosters[ii]->label;
		}
		assignment = rosters[ii]->duty;

		if (strRole == "*" || std::find(space->roles.begin(), space->roles.end(), rosters[ii]->role) != space->roles.end())
			isRole = true;

		if (strAtt == "*")
			isAttribute = true;
		else
		{
			/*
			0010413: 2个欧洲任务之间没有设置间隔，误告警.
			问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
			*/
			/*
			for (vector<string>::iterator single = space->attributes.begin(); single != space->attributes.end(); ++single)
			{
				if (attribute.find((*single)) != string::npos)
				{
					isAttribute = true;
					break;
				}
			}*/
			if (this->isPairingMatchAttributes(attribute, space->attributes))
			{
				isAttribute = true;
			}
		}

		if (strAssingment == "*" || std::find(space->assignments.begin(), space->assignments.end(), assignment) != space->assignments.end())
		isAssignment = true;
		if (!isAssignment)
			for (auto assignmentGroup : space->assignments){
				if (_dbData->isAssignmentInGroup(assignment, assignmentGroup)){
					isAssignment = true;
					break;
				}
			}

		//if (strLabel == "*" || std::find(labels.begin(), labels.end(), label) != labels.end())
		if (strLabel == "*")
			isLabel = true;
		else
		{
			for (vector<string>::iterator it = space->labels.begin(); it != space->labels.end(); ++it)
			{
				if (label.find((*it)) != string::npos)
				{
					isLabel = true;
					break;
				}
			}
		}

		if (space->strLocationSameTOBase != "*")
			if ((space->strLocationSameTOBase == "Y" && space->crewBase != rosters[ii]->location) ||
				(space->strLocationSameTOBase == "N" && space->crewBase == rosters[ii]->location))
				isBase = false;

		qualifier = rosters[ii]->qualifier;
		if (strQualifier == "*" || std::find(space->qualifiers.begin(), space->qualifiers.end(), qualifier) != space->qualifiers.end())
			isQualifier = true;

		if (strDest != "*")
		{
			if (rosters[ii]->pairing)
			{
				//vector<Segment*> segments = rosters[ii]->pairing->getSegments();
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->destinations.begin(), space->destinations.end(), segment->getArrStation()) != space->destinations.end())
						{
							isDest = true;
							break;
						}
					}
				}
				//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				//{
				//	if (std::find(space->destinations.begin(), space->destinations.end(), (*segment)->getDepStation()) != space->destinations.end())
				//	{
				//		isDest = true;
				//		break;
				//	}
				//}
			}
		}
		else
			isDest = true;
		
		if (strFlts != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->flightNumbers.begin(), space->flightNumbers.end(), segment->getFlightNumber()) != space->flightNumbers.end())
						{
							isFlight = true;
							break;
						}
					}
				}
			}
		}
		else
			isFlight = true;

		bool isAirport = false;
		if (space->strAirports != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->airports.begin(), space->airports.end(), segment->getArrStation()) != space->airports.end())
						{
							isAirport = true;
							break;
						}
						if (std::find(space->airports.begin(), space->airports.end(), segment->getDepStation()) != space->airports.end())
						{
							isAirport = true;
							break;
						}
					}
				}
			}
		}
		else
			isAirport = true;

		bool isOverrideDutyAttribute = false;
		if (!space->overrideDutyAttributes.empty())
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty* d = rosters[ii]->pairing->getDuty(di);
					if (d != nullptr) {
						if (this->isDutyMatchAttributes(d->getAttributes(), space->overrideDutyAttributes))
						{
							isOverrideDutyAttribute = true;
							break;
						}
					}
				}
			}
		}
		else {
			isOverrideDutyAttribute = true;
		}

		bool isLineTraining = false;
		if (space->isLineTraining != "*") {
			isLineTraining = (space->isLineTraining == "Y") == isTrainingFlight(rosters[ii], _dbData);
		}
		else {
			isLineTraining = true;
		}

		if (isFlight && isAttribute && isAssignment && isLabel && isBase && isQualifier && isDest
			&& (rosterIndex == FAILURE) && isRole && isAirport && isLineTraining && isOverrideDutyAttribute)
		{
			rosterIndex = ii;
			break;
		}
	}
	return rosterIndex;
}

int Utility::getFirstRoster(vector<SharedPtr<ROSTER>>& rosters, vector<string>& attributes, vector<string>& assignments, vector<string>& labels, vector<string>& qualifiers, string isRequested, string crewBase, string strLocationSameTOBase)
{
	int rosterIndex = FAILURE;
	int rostersize = (int)rosters.size();
	string attribute, assignment, rosterLabel;
	
	if (attributes.empty() || assignments.empty() || labels.empty() || qualifiers.empty()) {
		Logger::getRuleLogger()->error("invalid rule param, attr/assignment/label/qualifier is empty");
		return rosterIndex;
	}
	for (int ii = 0; ii < rostersize; ++ii)
	{
		bool isQualifier = false, isAttribute = false, isAssignment = false, isLabel = false,isBase=true;

		if ((!rosters[ii]->pairing) && (assignments[0] != "*" || labels[0] != "*"))
			continue;

		if (isRequested == "Y" && !(rosters[ii]->isRequested))
			continue;
		if (isRequested == "N" && (rosters[ii]->isRequested))
			continue;

		if (rosters[ii]->pairing)
		{
			attribute = rosters[ii]->pairing->getAttribute();
			rosterLabel = rosters[ii]->label;
		}
		else {
			attribute = rosters[ii]->attribute;
		}
		assignment = rosters[ii]->duty;
		
		//mantis#2240, 8064, 增加参数 qualifier
		if (qualifiers[0] == "*") {
			isQualifier = true;
		}
		else {
			isQualifier = isContains(qualifiers, rosters[ii]->qualifier);
		}

		if (attributes[0] == "*")
			isAttribute = true;
		else
		{
			/*
			0010413: 2个欧洲任务之间没有设置间隔，误告警.
			问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
			*/
			/*
			for (vector<string>::iterator single = attributes.begin(); single != attributes.end(); ++single)
			{
				if (attribute.find((*single)) != string::npos)
				{
					isAttribute = true;
					break;
				}
			}
			*/
			if (this->isPairingMatchAttributes(attribute, attributes))
			{
				isAttribute = true;
			}
		}

		if (assignments[0] == "*" || std::find(assignments.begin(), assignments.end(), assignment) != assignments.end())
			isAssignment = true;

		if (labels[0] == "*")
			isLabel = true;
		else
		{
			for (string& rpLabel : labels) {
				if (rosterLabel.find(rpLabel) != string::npos) //mantis#2241, label支持like
				{
					isLabel = true;
					break;
				}
			}
		}

		if ((strLocationSameTOBase=="Y" && crewBase != rosters[ii]->location) ||
			(strLocationSameTOBase == "N" && crewBase == rosters[ii]->location))
			isBase = false;

		if (isQualifier && isAttribute && isAssignment && isLabel && isBase && (rosterIndex == FAILURE))
		{
			rosterIndex = ii;
			break;
		}
	}
	return rosterIndex;
}

int Utility::getNextRoster(vector<SharedPtr<ROSTER>>& rosters, int iCurrentRoster, vector<string>& attributes, vector<string>& assignments, vector<string>& labels, vector<string>& qualifiers, string isRequested, string crewBase, string strLocationSameTOBase)
{
	int rosterIndex = FAILURE;

	if (attributes.empty() || assignments.empty() || labels.empty() || qualifiers.empty()) {
		Logger::getRuleLogger()->error("invalid rule param, attr/assignment/label/qualifier is empty");
		return rosterIndex;
	}

	if (iCurrentRoster < 0)
		return rosterIndex;

	int rostersize = (int)rosters.size();
	if (iCurrentRoster == rostersize) return rosterIndex;
	
	string attribute, assignment, rosterLabel;
	bool isQualifier = false, isAttribute = false, isAssignment = false, isLabel = false, isBase = true;
	for (int ii = iCurrentRoster + 1; ii < rostersize; ++ii)
	{
		isAttribute = false, isAssignment = false, isLabel = false,isBase=true;

		if ((!rosters[ii]->pairing) && (attributes[0] != "*" || labels[0] != "*"))
			continue;

		if (isRequested == "Y" && !(rosters[ii]->isRequested))
			continue;
		if (isRequested == "N" && (rosters[ii]->isRequested))
			continue;

		if (rosters[ii]->pairing)
		{
			attribute = rosters[ii]->pairing->getAttribute();
			rosterLabel = rosters[ii]->label;
		}
		assignment = rosters[ii]->duty;

		/*
		if (strAtt == "*" || attribute.find(strAtt) != strAtt.npos)
			isAttribute = true;
		if (strAssingment == "*" || assignment == strAssingment)
			isAssignment = true;
		if (strLabel == "*" || label == strLabel)
			isLabel = true;
		*/
		//mantis#2240, 8064, 增加qualifier匹配
		if (qualifiers[0] == "*") {
			isQualifier = true;
		}
		else {
			isQualifier = isContains(qualifiers, rosters[ii]->qualifier);
		}

		if (attributes[0] == "*")
			isAttribute = true;
		else
		{
			/*
			0010413: 2个欧洲任务之间没有设置间隔，误告警.
			问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
			*/
			/*
			for (vector<string>::iterator single = attributes.begin(); single != attributes.end(); ++single)
			{
				if (attribute.find((*single)) != string::npos)
				{
					isAttribute = true;
					break;
				}
			}
			*/
			if (this->isPairingMatchAttributes(attribute, attributes))
			{
				isAttribute = true;
			}
		}

		if (assignments[0] == "*" || std::find(assignments.begin(), assignments.end(), assignment) != assignments.end())
			isAssignment = true;

		if (labels[0] == "*")
			isLabel = true;
		else
		{
			for (string& rpLabel : labels) {
				if (rosterLabel.find(rpLabel) != string::npos) //mantis#2241, label支持like
				{
					isLabel = true;
					break;
				}
			}
		}


		if ((strLocationSameTOBase == "Y" && crewBase != rosters[ii]->location) ||
			(strLocationSameTOBase == "N" && crewBase == rosters[ii]->location))
			isBase = false;
		
		if (isQualifier && isAttribute && isAssignment && isLabel && isBase && (rosterIndex == FAILURE))
		{
			rosterIndex = ii;
			break;
		}
	}
	return rosterIndex;
}


int Utility::getNextRoster(vector<SharedPtr<ROSTER>>& rosters, int iCurrentRoster, roster_space* space, SharedPtr<CrewDataContext> _dbData)
{
	int rosterIndex = FAILURE;
	int rostersize = (int)rosters.size();
	if (rostersize <= 0)
		return rosterIndex;

	if (iCurrentRoster < 0)
		return rosterIndex;

	if (space->assignments.size() <= 0	||
		space->qualifiers.size()  <= 0	||
		space->labels.size()	  <= 0	||
		space->attributes.size()  <= 0	)

	{
		Logger::getRuleLogger()->info("space size=0");
		//return rosterIndex;
	}

	if (iCurrentRoster == rostersize) return rosterIndex;

	string strAtt = space->attributes[0], strLabel = space->labels[0], strAssingment = space->assignments[0], strQualifier = space->qualifiers[0], strDest = "*";
	//vector<string> attributes, assignments, labels;
	//boost::split(attributes, strAtt, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(assignments, strAssingment, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(labels, strLabel, boost::is_any_of("|"), boost::token_compress_on);
	string strRole = "*";
	if (space->roles.size()>0)
		strRole = space->roles[0];
	if (space->destinations.size()>0)
		strDest = space->destinations[0];

	string strFlts = "*";
	if (space->flightNumbers.size() > 0)
		strFlts = space->flightNumbers[0];

	string attribute, assignment, label, qualifier;
	bool isAttribute = false, isAssignment = false, isLabel = false, isBase = true, isQualifier=false, isDest=false, isRole=false, isFlight = false;
	for (int ii = iCurrentRoster + 1; ii < rostersize; ++ii)
	{
		isAttribute = false, isAssignment = false, isLabel = false, isBase = true, isQualifier = false, isDest = false, isRole = false;

		//if ((!rosters[ii]->pairing) && (strAtt != "*" || strLabel != "*"))
		if ((!rosters[ii]->pairing) && (strAtt != "*" || strLabel != "*"))
			continue;

		if (space->isRequested == "Y" && !(rosters[ii]->isRequested))
			continue;
		if (space->isRequested == "N" && (rosters[ii]->isRequested))
			continue;

		if (rosters[ii]->pairing)
		{
			attribute = rosters[ii]->pairing->getAttribute();
		}
		label = rosters[ii]->label;
		assignment = rosters[ii]->duty;

		if (strRole == "*" || std::find(space->roles.begin(), space->roles.end(), rosters[ii]->role) != space->roles.end())
			isRole = true;

		if (strAtt == "*")
			isAttribute = true;
		else
		{
			/*
			0010413: 2个欧洲任务之间没有设置间隔，误告警.
			问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
			*/
			/*
			for (vector<string>::iterator single = space->attributes.begin(); single != space->attributes.end(); ++single)
			{
				if (attribute.find((*single)) != string::npos)
				{
					isAttribute = true;
					break;
				}
			}
			*/
			if (this->isPairingMatchAttributes(attribute, space->attributes))
			{
				isAttribute = true;
			}
		}

		if (strAssingment == "*" || std::find(space->assignments.begin(), space->assignments.end(), assignment) != space->assignments.end())
			isAssignment = true;
		if (!isAssignment)
			for (auto assignmentGroup : space->assignments){
				if (_dbData->isAssignmentInGroup(assignment, assignmentGroup)){
					isAssignment = true;
					break;
				}
			}

		//if (strLabel == "*" || std::find(labels.begin(), labels.end(), label) != labels.end())
		if (strLabel == "*")
			isLabel = true;
		else
		{
			for (vector<string>::iterator it = space->labels.begin(); it != space->labels.end(); ++it)
			{
				if (label.find((*it)) != string::npos)
				{
					isLabel = true;
					break;
				}
			}
		}

		if (space->strLocationSameTOBase != "*")
			if ((space->strLocationSameTOBase == "Y" && space->crewBase != rosters[ii]->location) ||
				(space->strLocationSameTOBase == "N" && space->crewBase == rosters[ii]->location))
				isBase = false;

		qualifier = rosters[ii]->qualifier;
		if (strQualifier == "*" || std::find(space->qualifiers.begin(), space->qualifiers.end(), qualifier) != space->qualifiers.end())
			isQualifier = true;

		if (strDest != "*" )
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->destinations.begin(), space->destinations.end(), segment->getArrStation()) != space->destinations.end()) {
							isDest = true;
							break;
						}
					}
				}
				//vector<Segment*> segments = rosters[ii]->pairing->getSegments();
				//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				//{
				//	if (std::find(space->destinations.begin(), space->destinations.end(), (*segment)->getDepStation()) != space->destinations.end())
				//	{
				//		isDest = true;
				//		break;
				//	}
				//}
			}
		}
		else
			isDest = true;

		if (strFlts != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->flightNumbers.begin(), space->flightNumbers.end(), segment->getFlightNumber()) != space->flightNumbers.end())
						{
							isFlight = true;
							break;
						}
					}
				}
			}
		}
		else
			isFlight = true;

		bool isAirport = false;
		if (space->strAirports != "*")
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty * d = rosters[ii]->pairing->getDuty(di);
					for (std::size_t si = 0; si < d->getNumSegments(); si++) {
						Segment * segment = d->getSegment(si);
						if (std::find(space->airports.begin(), space->airports.end(), segment->getArrStation()) != space->airports.end())
						{
							isAirport = true;
							break;
						}
						if (std::find(space->airports.begin(), space->airports.end(), segment->getDepStation()) != space->airports.end())
						{
							isAirport = true;
							break;
						}
					}
				}
			}
		}
		else
			isAirport = true;

		bool isOverrideDutyAttribute = false;
		if (!space->overrideDutyAttributes.empty())
		{
			if (rosters[ii]->pairing)
			{
				for (std::size_t di = 0; di < rosters[ii]->pairing->getNumDuties(); di++) {
					Duty* d = rosters[ii]->pairing->getDuty(di);
					if (d != nullptr) {
						if (this->isDutyMatchAttributes(d->getAttributes(), space->overrideDutyAttributes))
						{
							isOverrideDutyAttribute = true;
							break;
						}
					}
				}
			}
		}
		else {
			isOverrideDutyAttribute = true;
		}

		bool isLineTraining = false;
		if (space->isLineTraining != "*") {
			isLineTraining = (space->isLineTraining == "Y") == isTrainingFlight(rosters[ii], _dbData);
		}
		else {
			isLineTraining = true;
		}

		if (isFlight && isAttribute && isAssignment && isLabel && isBase && isQualifier && isDest 
			&& (rosterIndex == FAILURE) && isRole && isAirport && isLineTraining && isOverrideDutyAttribute)
		{
			rosterIndex = ii;
			break;
		}
	}
	return rosterIndex;
}


int Utility::getPrevAttributeRoster(vector<SharedPtr<ROSTER>>& roster, int iCurrentRoster, string strAtt){
	int rosterIndex = FAILURE;
	int rostersize = (int)roster.size();

	if (iCurrentRoster == 0) return 0;
	for (int ii = iCurrentRoster - 1; ii >= 0; ii--) {
		if (!roster[ii]->pairing)
			continue;
		string pgAttributes = roster[ii]->pairing->getAttribute();
		/*
		0010413: 2个欧洲任务之间没有设置间隔，误告警.
		问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
		*/
		//if ((pgAttributes.find(strAtt) != strAtt.npos) &&	(rosterIndex == FAILURE))
		if ((this->isPairingMatchAttributes(pgAttributes, strAtt)) &&	(rosterIndex == FAILURE))
		{
			rosterIndex = ii;
			break;
		}

	}
	if (rosterIndex == FAILURE)	rosterIndex = iCurrentRoster;
	return rosterIndex;

}

int Utility::getNextAttributeRoster(vector<SharedPtr<ROSTER>>& roster, int iCurrentRoster, string strAtt){
	int rosterIndex = FAILURE;
	int rostersize = (int)roster.size();

	vector<string> attributes;
	split(strAtt, '|', attributes);
	if (iCurrentRoster == rostersize) return rosterIndex;
	for (int ii = iCurrentRoster + 1; ii < rostersize; ++ii) {
		if (!roster[ii]->pairing)
			continue;
		string pgAttribute = roster[ii]->pairing->getAttribute();

		bool bFound = false;
		/*
		0010413: 2个欧洲任务之间没有设置间隔，误告警.
		问题根源：法规配置为“N”，任务环的标签为“.INT.”。用find逻辑误认为符合条件，应修改为==
		for (auto singleAttribute : attributes)
		{
			if (attribute.find(singleAttribute) != strAtt.npos)
			{
				bFound = true;
				break;
			}
		}
		*/
		bFound = this->isPairingMatchAttributes(pgAttribute, attributes);

//		if ((roster[ii]->pairing->getAttribute().find(strAtt) != strAtt.npos) &&
		if (bFound && (rosterIndex == FAILURE))
		{
			rosterIndex = ii;
			break;
		}
	}
	return rosterIndex;
}

bool Utility::isCrewQualified(const SharedPtr<CREW>& crew, const vector<string>& strBases, const vector<string>& strRanks, const vector<string>& strFleets, const vector<string>& strTeams, const vector<string>& strPositions, const time_t eff, const time_t exp) const
{
	string base = "NULL", rank = "NULL", fleet = "NULL", team = "NULL",position="NULL";
	if (strBases.empty() || (strBases.size() == 1 && (strBases[0] == "*" || strBases[0].empty())))
		base = "*";
	if (strRanks.empty() || (strRanks.size() == 1 && (strRanks[0] == "*" || strRanks[0].empty())))
		rank = "*";
	if (strFleets.empty() || (strFleets.size() == 1 && (strFleets[0] == "*" || strFleets[0].empty())))
		fleet = "*";

	if (strPositions.empty() || (strPositions.size() == 1 && (strPositions[0] == "*" || strPositions[0].empty())))
		position = "*";
	

	if (strTeams.size() <= 0)
		team = "*";
	else if (strTeams.size() == 1 && (strTeams[0] == "*" || strTeams[0].empty()))
		team = "*";

	bool bFound = false;
	if (base != "*" && !base.empty())
	{
		const auto& bases = crew->baseList;
		for (const auto& base_it:bases)
		{
			if (
				(base_it->effUtc <= exp)
				&&
				(base_it->expUtc<0 || base_it->expUtc > eff)
				)
			{
				if (find(strBases.begin(), strBases.end(), base_it->base) != strBases.end())
				{
					bFound = true;
					break;
				}
			}
		}
		if (!bFound)
			return bFound;
	}

	if (fleet != "*" && !fleet.empty())
	{
		bFound = false;
		const auto& fleets = crew->fleetList;
		for (const auto& fleet_it :fleets)
		{
			if (
				(fleet_it->effUtc <= exp)
				&&
				(fleet_it->expUtc < 0 || fleet_it->expUtc > eff)
				)
			{
				if (std::find(strFleets.begin(), strFleets.end(), fleet_it->fleet) != strFleets.end())
				{
					bFound = true;
					break;
				}
			}
		}
		if (!bFound)
			return bFound;
	}

	if (rank != "*" && !rank.empty())
	{
		bFound = false;
		const auto& ranks = crew->rankList;
		for (const auto& rank_it:ranks)
		{
			if (
				(rank_it->effUtc <= exp)
				&&
				(rank_it->expUtc<0 || rank_it->expUtc > eff)
				)
			{
				if (find(strRanks.begin(), strRanks.end(), rank_it->rank) != strRanks.end())
				{
					bFound = true;
					break;
				}
			}
		}
		if (!bFound)
			return bFound;
	}

	if (position != "*" && !position.empty())
	{
		bFound = false;
		const auto& ranks = crew->rankList;
		for (const auto& rank_it : ranks)
		{
			if (
				(rank_it->effUtc <= exp)
				&&
				(rank_it->expUtc<0 || rank_it->expUtc > eff)
				)
			{
				if (find(strPositions.begin(), strPositions.end(), rank_it->position) != strPositions.end())
				{
					bFound = true;
					break;
				}
			}
		}
		if (!bFound)
			return bFound;
	}
	
	if (team != "*" && !strTeams.empty())
	{
		bFound = false;
		const auto& teams = crew->teamList;
		for (const auto& team_it:teams)
		{
			if (
				(team_it->effDt <= exp)
				&&
				(team_it->expDt<0 || team_it->expDt >= eff)
				)
			{
				if (find(strTeams.begin(), strTeams.end(), team_it->teamName) != strTeams.end())
				{
					bFound = true;
					break;
				}
			}
		}
		if (!bFound)
			return bFound;
	}

	return true;
}

bool Utility::isCrewQualified(const SharedPtr<CREW>& crew, const string base, const string rank, const string fleet, const string team, const string position, const time_t eff, const time_t exp) const
{
	//long lapsed3 = clock();///TEST=
	//vector<string> *strBases = NULL, *strRanks = NULL, *strFleets = NULL, *strTeams = NULL;
	//vector<string> strBases, strRanks, strFleets, strTeams;
	const vector<string>& strBases = splitWithCache(base, '|');
	const vector<string>& strRanks = splitWithCache(rank, '|');
	const vector<string>& strFleets = splitWithCache(fleet, '|');
	const vector<string>& strTeams = splitWithCache(team, '|');
	const vector<string>& strPositions = splitWithCache(position, '|');


	//long lapsed1 = clock();///TEST=
	bool bRetu = isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, strPositions, eff, exp);
	//bool bRetu = isCrewQualified(crew, *strBases, *strRanks, *strFleets, *strTeams, eff, exp);
	//long lapsed2 = clock();///TEST
	//RuleStatistics::GetInstancePtr()->addRuleCallClock(99990012, (lapsed2 - lapsed1));
	return bRetu;
}

bool Utility::isCrewTeamQualified(const SharedPtr<CREW>& crew, const string& rTeam, const time_t eff, const time_t exp) const {
	bool bRetu = false;
	string _rTeam = rTeam;
	const vector<string>& strTeams = splitWithCache(_rTeam, '|');
	if (strTeams.size() <= 0 || _rTeam.empty())
		_rTeam = "*";
	else if (strTeams.size() == 1 && strTeams[0] == "*")
		_rTeam = "*";

	if (_rTeam == "*"){
		return true;
	}
	if (_rTeam != "*" && !strTeams.empty())
	{
		vector<SharedPtr<CREW_TEAM>>& teams = crew->teamList;
		for (vector<SharedPtr<CREW_TEAM>>::iterator team = teams.begin(); team != teams.end(); ++team)
		{
			if (
				((*team)->effDt <= exp)
				&&
				((*team)->expDt<0 || (*team)->expDt >= eff)
				)
			{
				if (find(strTeams.begin(), strTeams.end(), (*team)->teamName) != strTeams.end())
				{
					bRetu = true;
					break;
				}
			}
		}
	}

	return bRetu;
}

bool Utility::isCrewTeamQualified(const SharedPtr<CREW>& crew, const vector<string>& teams, const time_t eff, const time_t exp) const {
	if (teams.empty()) {
		return true;
	}
	bool bFound = false;

	for (auto& team : crew->teamList)
	{
		if (
			(team->effDt <= exp)
			&&
			(team->expDt < 0 || team->expDt >= eff)
			)
		{
			if (find(teams.begin(), teams.end(), team->teamName) != teams.end())
			{
				bFound = true;
				break;
			}
		}
	}
	return bFound;
}

bool Utility::isCrewRankQualified(const SharedPtr<CREW>& crew, const string& rank, const time_t eff, const time_t exp) const {
	if (rank.empty() || rank == "*") {
		return true;
	}
	const vector<string>& ranks = splitWithCache(rank, '|');
	return isCrewRankQualified(crew, ranks, eff, exp);
}

bool Utility::isCrewRankQualified(const SharedPtr<CREW>& crew, const vector<string>& ranks, const time_t eff, const time_t exp) const {
	if (ranks.empty()) {
		return true;
	}
	bool bFound = false;
	for (const auto& rank_it : crew->rankList)
	{
		if (
			(rank_it->effUtc <= exp)
			&&
			(rank_it->expUtc<0 || rank_it->expUtc > eff)
			)
		{
			if (find(ranks.begin(), ranks.end(), rank_it->rank) != ranks.end())
			{
				bFound = true;
				break;
			}
		}
	}
	return bFound;
}


bool Utility::isCrewBaseQualified(const SharedPtr<CREW>& crew, const vector<string>& bases, const time_t eff, const time_t exp) const {
	if (bases.empty()) {
		return true;
	}
	bool bFound = false;
	for (const auto& base_it : crew->baseList)
	{
		if (
			(base_it->effUtc <= exp)
			&&
			(base_it->expUtc<0 || base_it->expUtc > eff)
			)
		{
			if (find(bases.begin(), bases.end(), base_it->base) != bases.end())
			{
				bFound = true;
				break;
			}
		}
	}
	return bFound;
}

bool Utility::isCrewFleetQualified(const SharedPtr<CREW>& crew, const vector<string>& fleets, const time_t eff, const time_t exp) const {
	if (fleets.empty()) {
		return true;
	}
	bool bFound = false;
	for (const auto& fleet_it : crew->fleetList)
	{
		if (
			(fleet_it->effUtc <= exp)
			&&
			(fleet_it->expUtc<0 || fleet_it->expUtc > eff)
			)
		{
			if (find(fleets.begin(), fleets.end(), fleet_it->fleet) != fleets.end())
			{
				bFound = true;
				break;
			}
		}
	}
	return bFound;
}

bool Utility::isCrewPositionQualified(const SharedPtr<CREW>& crew, const vector<string>& positions, const time_t eff, const time_t exp) const {
	if (positions.empty()) {
		return true;
	}
	bool bFound = false;
	for (const auto& rank_it : crew->rankList)
	{
		if (
			(rank_it->effUtc <= exp)
			&&
			(rank_it->expUtc<0 || rank_it->expUtc > eff)
			)
		{
			if (find(positions.begin(), positions.end(), rank_it->position) != positions.end())
			{
				bFound = true;
				break;
			}
		}
	}
	return bFound;
}

bool Utility::isCrewActingRankQualified(const SharedPtr<CREW>& crew, const long long fltId, const vector<string>& actingRanks, const SharedPtr<CrewDataContext>& dbData) const {
	if (actingRanks.empty()) {
		return true;
	}
	auto rf = dbData->rosterFlightMgr.get(fltId, crew->idCrew);
	if (rf != nullptr && !actingRanks.empty() && std::find(actingRanks.begin(), actingRanks.end(), rf->actingRank) == actingRanks.end()) {
		return false;
	}
	return true;
}

//判断时间是否是planing 还是tracking时间 planing返回true 反之false
bool Utility::isTrackingOrPlaning(time_t checkTime){
	time_t tt = time(NULL);
	tm* t = localtime(&tt);
	t->tm_mon = (t->tm_mon+1)%12;
	t->tm_mday = 0;
	t->tm_hour = 24;
	t->tm_min = 0;
	t->tm_sec = 0;
	time_t resultTime = _mkgmtime(t);
	if (resultTime <= checkTime){
		return true;
	}
	return false;
}
//类型转换
string Utility::iToa(int a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::lToa(long a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::llToa(long long a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::dToa(double a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::ToString(int a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::ToString(unsigned int a) {
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::ToString(long a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::ToString(long long a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::ToString(double a){
	stringstream stream;
	stream << a;
	string s = stream.str();
	return s;
}
string Utility::getClock_format(int t1, int t2){
	char buf[1024];
	sprintf(buf, "%d:%02d", t1, t2);
	string s = buf;
	return s;
};


/*
    判断任务环是否 符合标签过滤条件
	任务环标签：.INT.|P|A|.LAX.|.CAME.|.IC.
	标签过滤条件：Vector内多个标签
	2022/11/18
	Tiao
*/
bool Utility::isPairingMatchAttribute(const string& pairingAttributes, const string& singleAttributeCriteria)
{
	bool bReturn = false;
	vector<string> pgAttributes;
	split(pairingAttributes, '|', pgAttributes);
	for (auto& pgAttribute : pgAttributes)
	{
		if (pgAttribute == singleAttributeCriteria)
		{
			bReturn = true;
			break;
		}
	}
	return bReturn;
}

bool Utility::isPairingMatchAttributes(const string& pairingAttributes, const string& attributesCriterias)
{
	if (attributesCriterias == "*" || attributesCriterias == "")
		return true;
	vector<string> criteriras;
	split(attributesCriterias, '|', criteriras);
	return (isPairingMatchAttributes(pairingAttributes, criteriras));
}
bool Utility::isPairingMatchAttributes(const string& pairingAttributes,vector<string>& attributesCriterias)
{
	vector<string> pgAttributes,matchedAttributes;
	split(pairingAttributes,'|',  pgAttributes);

	sort(attributesCriterias.begin(), attributesCriterias.end());
	sort(pgAttributes.begin(), pgAttributes.end());
	set_intersection(attributesCriterias.begin(), attributesCriterias.end(), pgAttributes.begin(), pgAttributes.end(), back_inserter(matchedAttributes));
	//求交集 
	bool bFind = (matchedAttributes.size() > 0);
	return bFind;
}

bool Utility::isDutyMatchAttributes(const string& strDutyAttributes, const vector<string>& attributesCriterias)
{
	vector<string> matchedAttributes;
	vector<string> tmpDutyAttributes, tmpAttributesCriterias = attributesCriterias;
	split(strDutyAttributes, '|', tmpDutyAttributes);

	sort(tmpAttributesCriterias.begin(), tmpAttributesCriterias.end());
	sort(tmpDutyAttributes.begin(), tmpDutyAttributes.end());
	set_intersection(tmpAttributesCriterias.begin(), tmpAttributesCriterias.end(), tmpDutyAttributes.begin(), tmpDutyAttributes.end(), back_inserter(matchedAttributes));
	//求交集 
	bool bFind = (matchedAttributes.size() > 0);
	return bFind;
}

bool Utility::isTrainingFlight(const SharedPtr<ROSTER>& roster, const SharedPtr<CrewDataContext>& _dbData) const {
	bool isTraining = false;
	if (roster->pairing == nullptr) {
		return false;
	}

	auto tmProgramCourseList = _dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto iterCourse = _dbData->tmCourseMap.find(tmProgramCourse->courseId);
		if (iterCourse == _dbData->tmCourseMap.end()) {
			continue;
		}
		auto& course = iterCourse->second;
		if (course->courseType == "Line") {
			isTraining = true;
			break;
		}
	}
	return isTraining;
}

bool Utility::checkCoverdDPGapTimeRange(const time_t& checkStart, const time_t& checkEnd, const CrewDataContext* dbData) const {
	if (dbData->dictionaryMap.find("DP_GAP_TIME_RANGE") != dbData->dictionaryMap.end()) {
		const auto& dicList = dbData->dictionaryMap.at("DP_GAP_TIME_RANGE");
		if (!dicList.empty()) {
			string startHHMM = "";
			string endHHMM = "";
			for (const auto& dic : dicList) {
				if (dic->code == "Start") {
					startHHMM = dic->name;
				}
				else if (dic->code == "End") {
					endHHMM = dic->name;
				}
			}
			if (Utility::GetInstancePtr()->isTimeRangeContained(checkStart, checkEnd, startHHMM, endHHMM)) {
				return true;
			}

		}
	}
	//没有定义也需要扣除
	else {
		return true;
	}

	return false;
}



// 定义WGS84坐标系地球半径（单位：千米）
const double EARTH_RADIUS_KM = 6371.0088;

// 角度转弧度系数
const double DEG_TO_RAD = 3.14159265358979323846 / 180.0;

/**
 * @brief Haversine公式计算两个经纬度间的距离（高精度版）
 * @param pointA 坐标A
 * @param pointB 坐标B
 * @return 两点间距离（单位：米）
 */
int Utility::calculateDistanceHaversine(const LatLng& pointA, const LatLng& pointB) const {
	// 1. 角度转弧度
	double lat1 = pointA.lat * DEG_TO_RAD;
	double lng1 = pointA.lng * DEG_TO_RAD;
	double lat2 = pointB.lat * DEG_TO_RAD;
	double lng2 = pointB.lng * DEG_TO_RAD;

	// 2. 计算纬度差、经度差
	double deltaLat = lat2 - lat1;
	double deltaLng = lng2 - lng1;

	// 3. Haversine核心公式
	double a = pow(sin(deltaLat / 2), 2) + cos(lat1) * cos(lat2) * pow(sin(deltaLng / 2), 2);
	double c = 2 * atan2(sqrt(a), sqrt(1 - a));

	// 4. 计算距离（地球半径 * 圆心角）
	return EARTH_RADIUS_KM * c * 1000;
}

/**
 * @brief 球面余弦公式计算距离（简洁版，适合长距离）
 * @param pointA 坐标A
 * @param pointB 坐标B
 * @return 两点间距离（单位：米）
 */
int Utility::calculateDistanceCosine(const LatLng& pointA, const LatLng& pointB) const {
	// 角度转弧度
	double lat1 = pointA.lat * DEG_TO_RAD;
	double lng1 = pointA.lng * DEG_TO_RAD;
	double lat2 = pointB.lat * DEG_TO_RAD;
	double lng2 = pointB.lng * DEG_TO_RAD;

	// 球面余弦公式
	double distance = acos(sin(lat1) * sin(lat2) + cos(lat1) * cos(lat2) * cos(lng2 - lng1)) * EARTH_RADIUS_KM;
	return distance * 1000;
}

time_t Utility::getCurrentTimeInUTC(const SharedPtr<CrewDataContext>& dbData) {
	//string configCurrentUtcTime = dbData->getSystemParamValue("PHASE_TEST_CURRENT_TIME_UTC", "2026-04-20 02:00");
	string configCurrentUtcTime = dbData->getSystemParamValue("PHASE_TEST_CURRENT_TIME_UTC", "");
	if (!configCurrentUtcTime.empty()) {
		return utcStrToUtc(const_cast<char*>(configCurrentUtcTime.c_str()));
	}
	time_t now = time(nullptr);
	return now;
}