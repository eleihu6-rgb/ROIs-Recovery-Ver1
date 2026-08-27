#ifndef _THREADLOCAL_H_
#define _THREADLOCAL_H_
#include <string>
#include <vector>
#include <mutex>
#include <shared_mutex>
#include <assert.h>
#include <thread>
#include <atomic>

/*
* 该类主线程创建的ThreadLocal变量，不能按值传递到子线程（见InheritableThreadLocal）。
* 例如： ThreadLocal<unsigned int> _minRest = 1;
*/
template <class T>
class ThreadLocal {
private:

	struct ElementWrapper {

		void set(std::unique_ptr<T> p) {
			if (!p) {
				return;
			}
			_ptr = std::move(p);
		}

		std::unique_ptr<T>& get() const {
			return _ptr;
		}

		void release() {
			if (_ptr != nullptr) {
				_ptr.reset();
			}
		}

		mutable std::unique_ptr<T> _ptr;

	};

	struct ThreadEntry {
		ThreadEntry() {
			threadEntryPtr() = this;
		}

		~ThreadEntry() {
			destroying = true;
			threadEntryPtr() = nullptr;
		}

		bool destroying = false;
		std::vector<std::unique_ptr<ElementWrapper>> elements;

		std::thread::id tid() {
			return std::this_thread::get_id();
		}
	};

public:
	ThreadLocal() : _id() {
		_id = getCount();
	}

	ThreadLocal(T value) : _id() {
		_id = getCount();
		set(value);
	}

	ThreadLocal(const ThreadLocal& other) {
		_id = getCount();
		this->set(other.get());
	}

	ThreadLocal& operator=(const ThreadLocal& other) {
		this->set(other.get());
		return *this;
	}

	ThreadLocal(ThreadLocal&& other) noexcept : _id(other._id) {
		other._id = 0;
	}

	ThreadLocal& operator=(ThreadLocal&& other) noexcept {
        assert(this != &other);
		releaseIfExistsNoCreate();
		_id = other._id;
		other._id = 0;
		return *this;
	}

	~ThreadLocal() {
		releaseIfExistsNoCreate();
	}

	T& get() const {
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		return *(static_cast<T*>(elementWrapper->get().get()));
	}

	T& operator->() const { return get(); }

	void release() {
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		elementWrapper.reset();
	}

	void set(T newValue) {
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		elementWrapper->release();
		elementWrapper->set(std::make_unique<T>(newValue));
	}

	explicit operator bool() const {
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		auto value = static_cast<T*>(elementWrapper->get().get());
		return value != nullptr;
	}

	std::size_t getId() const {
		return _id;
	}
private:
	void releaseIfExistsNoCreate() {
		if (_id == 0) {
			return;
		}

		ThreadEntry* threadEntry = threadEntryPtr();
		if (threadEntry == nullptr || threadEntry->destroying || _id >= threadEntry->elements.size()) {
			return;
		}

		threadEntry->elements[_id].reset();
	}

	static ThreadEntry*& threadEntryPtr() {
		static thread_local ThreadEntry* ptr = nullptr;
		return ptr;
	}

	std::unique_ptr<ElementWrapper>& getById(const std::size_t id) const {
		assert(id != 0);
		static thread_local ThreadEntry threadEntry;
		if ( id >= threadEntry.elements.size()) {
			// resize the elements to current id with additional element default initialized to nullptr
			threadEntry.elements.resize(id + 1);
		}
		std::unique_ptr<ElementWrapper>& elementWrapper = threadEntry.elements[id];
		if (elementWrapper == nullptr) {
			elementWrapper = std::make_unique<ElementWrapper>();
			elementWrapper->set(std::make_unique<T>());
		}

		return elementWrapper;
	}

	mutable std::size_t _id{};

	static unsigned long getCount() {
		static std::atomic<unsigned long> _count{ 0 };
		return ++_count;
	}
};


#endif //_THREADLOCAL_H_
