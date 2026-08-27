#ifndef CritConnectionH
#define CritConnectionH

#include <vector>

using namespace std;

class CritConnection
{
public:
	CritConnection(string dep1, string arr1, string flt1, string dep2, string arr2, string flt2, string isHard)
	{
		_depSta1 = dep1;
		_arrSta1 = arr1;
		_fltNum1 = flt1;
		_depSta2 = dep2;
		_arrSta2 = arr2;
		_fltNum2 = flt2;
		if(isHard=="Y")
			_isHard = true;
		else
			_isHard = false;
	};
	~CritConnection(){};

	string getDepSta1(){return _depSta1;}
	string getArrSta1(){return _arrSta1;}
	string getFltNum1(){return _fltNum1;}
	string getDepSta2(){return _depSta2;}
	string getArrSta2(){return _arrSta2;}
	string getFltNum2(){return _fltNum2;}
	bool getIsHard(){return _isHard;}

private:
	string _depSta1;
	string _arrSta1;
	string _fltNum1;
	string _depSta2;
	string _arrSta2;
	string _fltNum2;
	bool _isHard = false;
};

#endif

